const request = require('supertest');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { app, findFileByExtension, lerUltimaLinhaDoLog } = require('./server');

jest.mock('fs');
jest.mock('child_process', () => ({
  execFile: jest.fn(),
}));

describe('lerUltimaLinhaDoLog Test', () => {
  const mockDirectory = '/mock/directory';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('Deve retornar a última linha do log quando o arquivo existe', () => {
    fs.existsSync.mockReturnValue(true);
    fs.readFileSync.mockReturnValue('Linha 1\nLinha 2\nLinha 3\n');

    const result = lerUltimaLinhaDoLog(mockDirectory);
    expect(result).toBe('Linha 3');
  });

  it('Deve retornar erro se o arquivo de log não existir', () => {
    fs.existsSync.mockReturnValue(false);

    const result = lerUltimaLinhaDoLog(mockDirectory);
    expect(result).toBe('Erro: Log de execução não encontrado.');
  });

  it('Deve retornar erro desconhecido se o arquivo estiver vazio', () => {
    fs.existsSync.mockReturnValue(true);
    fs.readFileSync.mockReturnValue('');

    const result = lerUltimaLinhaDoLog(mockDirectory);
    expect(result).toBe('Erro desconhecido.');
  });

  it('Deve ignorar linhas vazias no log', () => {
    fs.existsSync.mockReturnValue(true);
    fs.readFileSync.mockReturnValue('Linha 1\n\n\nLinha 4\n');

    const result = lerUltimaLinhaDoLog(mockDirectory);
    expect(result).toBe('Linha 4');
  });
});

describe('findFileByExtension Test', () => {
  const mockDirectory = '/mock/directory';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('Deve lançar erro se o diretório não existir', () => {
    fs.existsSync.mockReturnValue(false);

    expect(() => findFileByExtension(mockDirectory, 'pdf'))
      .toThrow(`Diretório ${mockDirectory} não encontrado.`);
  });

  it('Deve lançar erro se nenhum arquivo com a extensão for encontrado', () => {
    fs.existsSync.mockReturnValue(true);
    fs.readdirSync.mockReturnValue(['file1.txt', 'file2.docx']); // Sem arquivos .pdf

    expect(() => findFileByExtension(mockDirectory, 'pdf'))
      .toThrow(`Nenhum arquivo com a extensão .pdf encontrado no diretório ${mockDirectory}`);
  });
});

describe('Endpoint Tests', () => {
  it('Deve executar uma tarefa', async () => {
    const response = await request(app)
      .post('/executar')
      .set('Content-Type', 'application/json')
      .send({
        opcao: '1. Download PDF Católica',
        user: 'user123',
        password: process.env.TEST_PASS,
        mes: 'January',
        userEmail: 'user@example.com',
      });

    expect(response.status).toBe(202);
    expect(response.body).toHaveProperty('id');
  });

  it('Deve retornar erro no status de uma tarefa caso e-mail errado', async () => {
    const taskId = uuidv4();
    fs.existsSync.mockReturnValue(true);

    global.taskStatus = {
      [taskId]: {
        status: 'Concluido',
        tipoArquivo: 'pdf',
        resultado: 'path/to/file.pdf',
        mensagem: 'Execução finalizada.',
        userEmail: 'user@example.com',
      },
    };

    const response = await request(app)
      .get(`/status/${taskId}`)
      .set('email', 'user2@example.com');

    expect(response.status).toBe(404);
    expect(response.body.mensagem).toBe('Tarefa não encontrada.');
  });

  it('Deve retornar as tarefas do usuário', async () => {
    const taskId = uuidv4();
    global.taskStatus = {
      [taskId]: {
        status: 'Pendente',
        opcao: '1. Download PDF Católica',
        userEmail: 'user@example.com',
        mensagem: 'Em execução...',
      },
    };

    const response = await request(app)
      .get('/minhas-tarefas')
      .set('email', 'user@example.com');

    expect(response.status).toBe(200);
    expect(response.body[0]).toHaveProperty('id');
  });

  it('Deve retornar erro ao tentar excluir uma tarefa com e-mail errado', async () => {
    const taskId = uuidv4();
    fs.existsSync.mockReturnValue(true);
    fs.rmSync.mockReturnValue(true);
  
    global.taskStatus = {
      [taskId]: {
        status: 'Pendente',
        opcao: '1. Download PDF Católica',
        userEmail: 'user@example.com',
        mensagem: 'Em execução...',
      },
    };
  
    expect(global.taskStatus[taskId]).toBeDefined();
  
    const response = await request(app)
      .delete(`/excluir/${taskId}`)
      .set('userEmail', 'user2@example.com');
  
    expect(response.status).toBe(404);
    expect(response.body.mensagem).toBe('Tarefa não encontrada.');
  });

  it('Deve retornar erro ao tentar executar uma tarefa com parâmetros faltando', async () => {
    const response = await request(app)
      .post('/executar')
      .set('Content-Type', 'application/json')
      .send({
        opcao: '1. Download PDF Católica',
        user: 'user123',
        userEmail: 'user@example.com',
      });
  
    expect(response.status).toBe(400);
    expect(response.body.mensagem).toBe('Parâmetros incompletos para gerar a Fatura Católica.');
  });

  it('Deve retornar erro ao tentar executar uma tarefa com opção inválida', async () => {
    const response = await request(app)
      .post('/executar')
      .set('Content-Type', 'application/json')
      .send({
        opcao: 'Opção inválida',
        user: 'user123',
        password: process.env.TEST_PASS,
        mes: 'January',
        userEmail: 'user@example.com',
      });
  
    expect(response.status).toBe(400);
    expect(response.body.mensagem).toBe('Opção inválida.');
  });

  it('Deve retornar erro quando a tarefa não existir', async () => {
    const response = await request(app)
      .get(`/status/invalid-task-id`)
      .set('email', 'user@example.com');
  
    expect(response.status).toBe(404);
    expect(response.body.mensagem).toBe('Tarefa não encontrada.');
  });
  
  it('Deve retornar tarefa em execução', async () => {
    const taskId = uuidv4();
    global.queue = [
      {
        id: taskId,
        opcao: '1. Download PDF Católica',
        userEmail: 'user@example.com',
        status: 'Em execução',
      },
    ];
  
    const response = await request(app)
      .get('/minhas-tarefas')
      .set('email', 'user@example.com');
  
    expect(response.status).toBe(200);
    expect(response.body.length).toBe(1);
    expect(response.body[0].status).toBe('Em execução');
  });

  it('Deve retornar erro ao tentar baixar arquivo inexistente', async () => {
    const taskId = uuidv4();
    fs.existsSync.mockReturnValue(false);
  
    global.taskStatus = {
      [taskId]: {
        status: 'Concluido',
        tipoArquivo: 'pdf',
        resultado: 'path/to/nonexistent-file.pdf',
        mensagem: 'Execução finalizada.',
        userEmail: 'user@example.com',
      },
    };
  
    const response = await request(app)
      .get(`/status/${taskId}`)
      .set('email', 'user@example.com');
  
    expect(response.status).toBe(404);
    expect(response.body.mensagem).toBe('Tarefa não encontrada.');
  });
});
