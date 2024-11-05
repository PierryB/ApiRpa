const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');

const app = express();

app.use(cors({
  origin: ['https://boettscher.com.br', 'http://localhost:3000'],
  methods: ['POST', 'GET', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Email'],
}));

app.use(bodyParser.json());

let taskStatus = {};

const executeAutomation = (opcao, params) => {
  let exePath;

  if (opcao === '1. Download PDF Católica') {
    exePath = "C:\\RPAs\\net8.0\\FaturaPdfCatolica.exe";
  } else if (opcao === '2. Relatório FIPE') {
    throw new Error('Opção Relatório FIPE ainda não disponível...');
    //exePath = "C:\\GitHub\\RelatorioFipe\\RelatorioFipe.exe";
  } else {
    throw new Error('Opção inválida.');
  }

  return new Promise((resolve, reject) => {
    execFile(exePath, params, (error, stdout, stderr) => {
      if (error) {
        return reject(error.message);
      }

      const filePath = stdout.trim();
      if (fs.existsSync(filePath)) {
        const fileType = opcao === '1. Download PDF Católica' ? 'pdf' : 'excel';
        resolve({ status: 'Concluido', resultado: filePath, tipoArquivo: fileType, mensagem: 'Arquivo gerado com sucesso.' });
      } else {
        reject(`Erro: O arquivo ${fileType} não foi gerado.`);
      }
    });
  });
};

const lerUltimaLinhaDoLog = (diretorioTemp) => {
  const logPath = path.join(diretorioTemp, 'log.txt');
  
  if (!fs.existsSync(logPath)) {
    return 'Erro: Log de execução não encontrado.';
  }

  const logLines = fs.readFileSync(logPath, 'utf-8').split('\n').filter(line => line.trim() !== '');
  return logLines.length > 0 ? logLines[logLines.length - 1] : 'Erro desconhecido.';
};

app.post('/executar', async (req, res) => {
  const { opcao, user, password, marca, modelo, mes, userEmail } = req.body;
  const id = uuidv4();
  const diretorioTemp = `C:\\temp\\rpa\\${id}`;
  const currentTime = new Date().toLocaleString();

  taskStatus[id] = { 
    status: 'Pendente', 
    opcao, 
    userEmail, 
    mensagem: 'Em execução...', 
    resultado: null,
    tipoArquivo: null,
    dataHora: currentTime 
  };

  try {
    let params = [];

    if (opcao === '1. Download PDF Católica') {
      if (!user || !password) {
        throw new Error('Parâmetros incompletos para gerar a Fatura Católica.');
      }
      params = [user, password, diretorioTemp];
    } else if (opcao === '2. Relatório FIPE') {
      if (!marca || !modelo || !mes) {
        throw new Error('Parâmetros incompletos para gerar o Relatório FIPE.');
      }
      params = [marca, modelo, mes, diretorioTemp];
    } else {
      throw new Error('Opção inválida.');
    }

    const resultado = await executeAutomation(opcao, params, diretorioTemp);
    taskStatus[id] = { ...taskStatus[id], ...resultado };
    res.json({ id, mensagem: 'Execução iniciada.' });
  } catch (error) {
    const mensagemErro = lerUltimaLinhaDoLog(diretorioTemp);
    taskStatus[id].status = 'Falha';
    taskStatus[id].mensagem = mensagemErro;
    res.status(500).json({ mensagem: mensagemErro });
  }
});

app.get('/minhas-tarefas', (req, res) => {
  const userEmail = req.headers.email;

  const userTasks = Object.entries(taskStatus)
    .filter(([_, task]) => task.userEmail === userEmail)
    .map(([id, task]) => ({
      id,
      opcao: task.opcao,
      dataHora: task.dataHora,
      status: task.status,
      mensagem: task.mensagem,
    }));

  res.json(userTasks);
});

app.get('/status/:id', (req, res) => {
  const { id } = req.params;
  const userEmail = req.headers.email;

  if (!taskStatus[id]) {
    return res.status(404).json({ mensagem: 'Tarefa não encontrada.' });
  }

  if (taskStatus[id].userEmail !== userEmail) {
    return res.status(403).json({ mensagem: 'Acesso negado para essa tarefa.' });
  }

  const statusInfo = taskStatus[id];
  const { tipoArquivo, resultado } = statusInfo;

  if (statusInfo.status === 'Concluido' && resultado && fs.existsSync(resultado)) {
    if (tipoArquivo === 'pdf') {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=Fatura_${Date.now()}.pdf`);
    } else if (tipoArquivo === 'excel') {
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename=Relatorio_FIPE_${Date.now()}.xlsx`);
    }
    return fs.createReadStream(resultado).pipe(res);
  } else {
    res.json({ status: statusInfo.status, mensagem: statusInfo.mensagem });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
