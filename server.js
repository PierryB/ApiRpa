const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const https = require('https');
const multer = require('multer');
const app = express();
const PORT = 3001;

require('dotenv').config();
const upload = multer({ dest: process.env.UPLOAD_DIR });

app.use(cors({
  origin: ['https://boettscher.com.br', 'http://localhost:3000'],
  methods: ['POST', 'GET', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Email'],
}));

app.use(bodyParser.json());

let taskStatus = {};
let isExecutou = false;
let mensagemErroRpa = '';

const findFileByExtension = (directory, extension) => {
  const files = fs.readdirSync(directory);
  const matchedFiles = files.filter(file => path.extname(file) === `.${extension}`);
  
  if (matchedFiles.length === 0) {
    throw new Error(`Nenhum arquivo com a extensão .${extension} encontrado no diretório ${directory}`);
  }
  return path.join(directory, matchedFiles[0]);
};

const executeAutomation = (opcao, params) => {
  let exePath;

  if (opcao === '1. Download PDF Católica') {
    exePath = "C:\\RPAs\\FaturaCatolica\\net8.0\\FaturaPdfCatolica.exe";
  } else if (opcao === '2. Relatório FIPE') {
    exePath = "C:\\RPAs\\HistoricoFipe\\net8.0\\HistoricoFipe.exe";
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
      try {
        const extension = opcao === '1. Download PDF Católica' ? 'pdf' : 'xlsx';
        const filePath = findFileByExtension(params[params.length - 1], extension);

        resolve({
          status: 'Concluido',
          resultado: filePath,
          tipoArquivo: extension,
          mensagem: 'Arquivo gerado com sucesso.',
        });
      } catch (err) {
        reject(err.message);
      }
    });
  });
};

const lerUltimaLinhaDoLog = (diretorioTemp) => {
  const logPath = path.join(process.env.TEMP_DIR, id, 'log.txt');
  
  if (!fs.existsSync(logPath)) {
    return 'Erro: Log de execução não encontrado.';
  }
  const logLines = fs.readFileSync(logPath, 'utf-8').split('\n').filter(line => line.trim() !== '');
  return logLines.length > 0 ? logLines[logLines.length - 1] : 'Erro desconhecido.';
};

app.post('/executar', upload.single('file'), async (req, res) => {
  const { opcao, user, password, mes, userEmail } = req.body;
  const id = uuidv4();
  const diretorioTemp = path.join(process.env.TEMP_DIR, id);
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

    const resultado = await executeAutomation(opcao, params);
    taskStatus[id] = { ...taskStatus[id], ...resultado };
    res.json({ id, mensagem: 'Execução finalizada.' });
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
    const fileName = tipoArquivo === 'pdf'
      ? `FaturaCatolica ${Date.now()}.pdf`
      : `Excel Tabela Fipe.xlsx`;

    if (tipoArquivo === 'pdf') {
      res.setHeader('Content-Type', 'application/pdf');
    } else if (tipoArquivo === 'xlsx') {
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    }

    res.setHeader('Content-Disposition', `attachment; filename=${fileName}`);
    return fs.createReadStream(resultado).pipe(res);
  } else {
    res.json({ status: statusInfo.status, mensagem: statusInfo.mensagem });
  }
});

app.delete('/excluir/:id', (req, res) => {
  const { id } = req.params;
  const userEmail = req.headers.email;

  if (!id || id === 'undefined') {
    return res.status(400).json({ mensagem: 'ID da execução inválido.' });
  }

  if (!taskStatus[id]) {
    return res.status(404).json({ mensagem: 'Tarefa não encontrada.' });
  }

  if (taskStatus[id].userEmail !== userEmail) {
    return res.status(403).json({ mensagem: 'Acesso negado para excluir esta tarefa.' });
  }

  const diretorioTemp = path.join('C:\\temp\\rpa', id);
  if (fs.existsSync(diretorioTemp)) {
    fs.rmSync(diretorioTemp, { recursive: true, force: true });
  }

  delete taskStatus[id];
  res.json({ mensagem: 'Execução excluída com sucesso.' });
});

if (fs.existsSync(process.env.CERT_PATH)) {
  const options = {
    pfx: fs.readFileSync(process.env.CERT_PATH),
    passphrase: process.env.CERT_PW,
  };

  https.createServer(options, app).listen(PORT, () => {
    console.log(`Servidor HTTPS rodando na porta ${PORT}`);
  });
} else {
  app.listen(PORT, () => {
    console.log(`Servidor HTTP rodando na porta ${PORT}`);
  });
}