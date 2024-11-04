const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const { execFile } = require('child_process');
const fs = require('fs');

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
    exePath = "C:\\GitHub\\DownloadPdfCatolica\\FaturaPdfCatolica\\FaturaPdfCatolica\\bin\\Release\\net8.0\\FaturaPdfCatolica.exe";
  } else if (opcao === '2. Relatório FIPE') {
    exePath = "";
    throw new Error('Opção Relatório FIPE ainda não disponível...');
  }

  return new Promise((resolve, reject) => {
    execFile(exePath, params, (error, stdout, stderr) => {
      if (error) {
        return reject(`Erro na execução: ${stderr || stdout}`);
      }

      const isPdf = stdout.trim().endsWith('.pdf') && fs.existsSync(stdout.trim());

      if (isPdf) {
        resolve({ status: 'Concluido', resultado: stdout.trim(), mensagem: 'PDF gerado com sucesso.' });
      } else {
        reject(`Erro na execução: ${stdout || stderr}`);
      }
    });
  });
};

app.post('/executar', async (req, res) => {
  const { opcao, user, password, marca, modelo, mes, userEmail } = req.body;
  const id = uuidv4();
  const currentTime = new Date().toLocaleString();

  taskStatus[id] = { 
    status: 'Pendente', 
    opcao, 
    userEmail, 
    mensagem: '', 
    resultado: null, 
    dataHora: currentTime 
  };

  try {
    let params = [];

    if (opcao === '1. Download PDF Católica') {
      params = [user, password];
    } else if (opcao === '2. Relatório FIPE') {
      if (!marca || !modelo || !mes) {
        throw new Error('Parâmetros incompletos para gerar o Relatório FIPE.');
      }
      params = [marca, modelo, mes];
    } else {
      throw new Error('Opção inválida.');
    }

    const resultado = await executeAutomation(opcao, params);
    taskStatus[id] = { ...taskStatus[id], ...resultado };
  } catch (error) {
    taskStatus[id].status = 'Falha';
    console.log(error.message)
    taskStatus[id].mensagem = error.message;
  }

  res.json({ id, mensagem: 'Execução iniciada.' });
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

  if (statusInfo.status === 'concluido' && statusInfo.resultado) {
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=Fatura_${Date.now()}.pdf`);
    return fs.createReadStream(statusInfo.resultado).pipe(res);
  } else {
    res.json({ status: statusInfo.status, mensagem: statusInfo.mensagem });
  }
});

app.delete('/excluir/:id', (req, res) => {
  const { id } = req.params;
  const userEmail = req.headers.email;

  if (!taskStatus[id]) {
    return res.status(404).json({ mensagem: 'Tarefa não encontrada.' });
  }

  if (taskStatus[id].userEmail !== userEmail) {
    return res.status(403).json({ mensagem: 'Acesso negado para essa tarefa.' });
  }

  delete taskStatus[id];
  res.json({ mensagem: 'Tarefa excluída com sucesso.' });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
