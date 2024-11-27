const request = require('supertest');
const app = require('./server');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

jest.mock('fs');
jest.mock('child_process', () => ({
  execFile: jest.fn(),
}));

describe('API Tests', () => {
  it('Deve executar uma tarefa', async () => {
    const response = await request(app)
      .post('/executar')
      .set('Content-Type', 'application/json')
      .send({
        opcao: '1. Download PDF Católica',
        user: 'user123',
        password: 'password123',
        mes: 'January',
        userEmail: 'user@example.com',
      });

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('id');
  });

  it('Deve retornar o status de uma tarefa', async () => {
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
      .set('email', 'user@example.com');

    expect(response.status).toBe(200);
    expect(response.headers['content-disposition']).toContain('attachment');
    expect(response.headers['content-type']).toContain('application/pdf');
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
    expect(response.body.length).toBe(1);
    expect(response.body[0]).toHaveProperty('id');
  });

  it('Deve excluir uma tarefa', async () => {
    const taskId = uuidv4();

    fs.rmSync.mockReturnValue(true);
    global.taskStatus = {
      [taskId]: {
        userEmail: 'user@example.com',
      },
    };

    const response = await request(app)
      .delete(`/excluir/${taskId}`)
      .set('email', 'user@example.com');

    expect(response.status).toBe(200);
    expect(response.body.mensagem).toBe('Execução excluída com sucesso.');
  });
});
