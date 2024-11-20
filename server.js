const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const https = require('https');
const multer = require('multer');
const upload = multer({ dest: 'C:\\temp\\uploads\\' });

const app = express();

app.use(cors({
  origin: ['https://boettscher.com.br', 'http://localhost:3000'],
  methods: ['POST', 'GET', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Email'],
}));

app.use(bodyParser.json());

const options = {
  pfx: fs.readFileSync('C:\\Users\\Administrator\\Documents\\cert.pfx'),
  passphrase: '#123',
};

let taskStatus = {};
let isExecutou = false;
let mensagemErroRpa = '';

const executeAutomation = (opcao, params) => {
  let exePath;

  if (opcao === '1. Download PDF Católica') {
    exePath = "C:\\RPAs\\FaturaCatolica\\net8.0\\FaturaPdfCatolica.exe";
  } else if (opcao === '2. Relatório FIPE') {
    mensagemErroRpa = 'Opção Relatório FIPE indisponível...';
    throw new Error(mensagemErroRpa);
    //exePath = "C:\\RPAs\\HistoricoFipe\\net8.0\\HistoricoFipe.exe";
  } else if (opcao === '3. Consulta CNPJs') {
    mensagemErroRpa = 'Opção Consulta CNPJs indisponível...';
    throw new Error(mensagemErroRpa);
    //exePath = "C:\\RPAs\\ConsultaCnpj\\net8.0\\ConsultaCNPJs.exe";
  } else {
    throw new Error('Opção inválida.');
  }

  return new Promise((resolve, reject) => {
    execFile(exePath, params, (error, stdout) => {
      isExecutou = true;
      if (error) {
        return reject(error.message);
      }
      const filePath = stdout.trim();
      const fileType = opcao === '1. Download PDF Católica' ? 'pdf' : 'excel';
      if (fs.existsSync(filePath)) {
        resolve({ status: 'Concluido', resultado: filePath, tipoArquivo: fileType, mensagem: 'Arquivo gerado com sucesso.' });
      } else {
        reject(`O arquivo ${fileType} não foi gerado. ${stdout.trim()}`);
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

app.post('/executar', upload.single('file'), async (req, res) => {
  const { opcao, user, password, mes, userEmail } = req.body;
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
      if (!mes) {
        throw new Error('Parâmetros incompletos para gerar o Relatório FIPE.');
      }
      params = [mes, diretorioTemp];
    } else if (opcao === '3. Consulta CNPJs') {
      if (!req.file) {
        throw new Error('Parâmetros incompletos para gerar a Consulta CNPJs.');
      }

      const filePath = req.file.path;
      params = [filePath, diretorioTemp];
    } else {
      throw new Error('Opção inválida.');
    }

    const resultado = await executeAutomation(opcao, params, diretorioTemp);
    taskStatus[id] = { ...taskStatus[id], ...resultado };
    res.json({ id, mensagem: 'Execução iniciada.' });
  } catch (error) {
    let mensagemErro
    if (isExecutou)
    {
      mensagemErro = lerUltimaLinhaDoLog(diretorioTemp);
      isExecutou = false;
    }
    else
    {
      mensagemErro = mensagemErroRpa;
    }
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
      res.setHeader('Content-Disposition', `attachment; filename=Relatorio_${Date.now()}.xlsx`);
    }
    return fs.createReadStream(resultado).pipe(res);
  } else {
    res.json({ status: statusInfo.status, mensagem: statusInfo.mensagem });
  }
});

const PORT = process.env.PORT || 3001;
https.createServer(options, app).listen(PORT, () => {
  console.log(`Servidor HTTPS rodando na porta ${PORT}`);
});
