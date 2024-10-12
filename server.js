const express = require('express');
const bodyParser = require('body-parser');
const { execFile } = require('child_process');
const { v4: uuidv4 } = require('uuid');
const jwt = require('jsonwebtoken');
const app = express();
const cors = require('cors');

app.use(cors({
    origin: 'https://boettscher.com.br' || 'http://localhost:3000',
    methods: ['POST', 'GET'],
    allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(bodyParser.json());

const taskQueue = [];
const taskStatus = {};

const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) return res.sendStatus(401);

    jwt.verify(token, process.env.AUTH0_SECRET, (err, user) => {
        if (err) return res.sendStatus(403);
        req.user = user;
        next();
    });
};

const processTaskQueue = () => {
    if (taskQueue.length > 0) {
        const currentTask = taskQueue.shift(); // Remove a tarefa da fila
        taskStatus[currentTask.id].status = 'executando';

        const { opcao, user, password, id } = currentTask;

        if (opcao === '1. Download PDF Católica') {
            const caminhoExecutavel = "C:\\GitHub\\DownloadPdfCatolica\\FaturaPdfCatolica\\FaturaPdfCatolica\\bin\\Release\\net8.0\\FaturaPdfCatolica.exe";

            execFile(caminhoExecutavel, [user, password], { encoding: 'buffer' }, (error, stdout) => {
                if (error) {
                    taskStatus[id].status = 'erro';
                    taskStatus[id].mensagem = error.message;
                    taskStatus[id].resultado = stdout.toString();
                } else {
                    const contentType = stdout.toString().includes('%PDF') ? 'pdf' : 'message';
                    if (contentType === 'pdf') {
                        taskStatus[id].status = 'concluido';
                        taskStatus[id].resultado = stdout;
                    } else {
                        taskStatus[id].status = 'erro';
                        taskStatus[id].mensagem = stdout.toString('utf-8');
                    }
                }
                processTaskQueue();
            });
        } else if (opcao === '2. Relatório FIPE') {
            taskStatus[id].status = 'erro';
            taskStatus[id].mensagem = 'Opção ainda não está pronta...';
            processTaskQueue();
        } else {
            taskStatus[id].status = 'erro';
            taskStatus[id].mensagem = 'Opção inválida.';
            processTaskQueue();
        }
    }
};

app.post('/executar', authenticateToken, (req, res) => {
    const { opcao, user, password, marca, modelo, mes } = req.body;
    const id = uuidv4();

    taskQueue.push({ id, opcao, user, password, marca, modelo, mes, usuario: req.user.sub });
    taskStatus[id] = { status: 'pendente', usuario: req.user.sub, mensagem: '', resultado: null };

    if (taskQueue.length === 1) {
        processTaskQueue();
    }

    res.json({ id, mensagem: 'Tarefa adicionada à fila, use o ID para verificar o status.' });
});

app.get('/status/:id', authenticateToken, (req, res) => {
    const { id } = req.params;

    if (!taskStatus[id]) {
        return res.status(404).json({ mensagem: 'Tarefa não encontrada.' });
    }

    if (taskStatus[id].usuario !== req.user.sub) {
        return res.status(403).json({ mensagem: 'Acesso negado para essa tarefa.' });
    }

    const statusInfo = taskStatus[id];
    if (statusInfo.status === 'concluido' && statusInfo.resultado) {
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=Fatura_${Date.now()}.pdf`);
        return res.send(statusInfo.resultado);
    } else {
        res.json({ status: statusInfo.status, mensagem: statusInfo.mensagem });
    }
});

app.get('/minhas-tarefas', authenticateToken, (req, res) => {
    const userTasks = Object.entries(taskStatus)
        .filter(([id, task]) => task.usuario === req.user.sub)
        .map(([id, task]) => ({ id, status: task.status, mensagem: task.mensagem }));

    res.json(userTasks);
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});
