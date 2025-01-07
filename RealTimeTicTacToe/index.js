const express = require("express");
const app = express();

const path = require('path');
const http = require('http');
const {Server} = require('socket.io');

const server =  http.createServer(app);

const io = new Server(server);

// middleware
app.use(express.static(path.resolve("")))

app.get