// server/index.js
const http = require('http');
const fs = require('fs');
const express = require("express");
const expressWs = require('express-ws');

const WebSocket = require('ws');

const key = fs.readFileSync('./key.pem');
const cert = fs.readFileSync('./cert.pem');

const app = express();
const server = http.createServer({key: key, cert: cert }, app);


const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3001;

const Gpio = require('onoff').Gpio;
//const sense = new Gpio(17, 'in', 'both', {debounceTimeout: 500});
//const sense1 = new Gpio(27, 'in', 'both', {debounceTimeout: 500});
//const pump = new Gpio(22, 'high');

//pump.writeSync(1);

const config = [
  {
    name: 'sensor1',
    mode: 'input',
    pin: 17,
  },
  //{
    //name: 'sensor2',
    //mode: 'input',
    //pin: 27,
  //},
  {
    name: 'pump1',
    mode: 'output',
    pin: 22,
    init: 'high',
  },
];

const trigs = [
  {
    sensor: 'sensor1',
    servo: 'pump1',
    type: 'lesser',
    value: 1,
    intv: 5000,
    duration: 10000,
  },
];

// INITIATING VARS

var sensArray = [];
var servArray = [];

var sensInitArray = [];
var servInitArray = [];

var trigArray = [];
var servTimeoutArray = [];

var messageSensor = null;
var messageServo = null;

var valArray = {};
var valArrayServ = {};

var events = require('events');
var eventEmitter = new events.EventEmitter();


// READ CONFIG, INIT SENSOR SERVO TRIGGER

for (let i = 0; i < config.length; i += 1) {
  console.log('comp', config[i]);
  if (config[i].mode === 'input') {
    sensArray.push({
      name: config[i].name,
      pin: config[i].pin,
    });
    sensInitArray.push(new Gpio(config[i].pin, 'in', 'both', {debounceTimeout: 500}));
    valArray[config[i].name] = null;
  } else if (config[i].mode === 'output') {
    servArray.push({
      name: config[i].name,
      pin: config[i].pin,
      init: config[i].init,
    });
    if (config[i].init === 'high') {
      servInitArray.push(new Gpio(config[i].pin, 'high'));
    } else {
      servInitArray.push(new Gpio(config[i].pin, 'out'));
    };
  };
}

for (let i = 0; i < trigs.length; i += 1) {
  trigArray.push(setInterval(() => {
    //let sensorIndex = sensArray.findIndex((item) => item.name === trigs[i].sensor);
    let servoIndex = servArray.findIndex((item) => item.name === trigs[i].servo);
    console.log('trigger', servoIndex);
    if (valArray[trigs[i].sensor] && valArrayServ[trigs[i].servo] && !servTimeoutArray[trigs[i].servo]) {
      if (trigs[i].type === 'bigger' && valArray[trigs[i].sensor] > trigs[i].value) {
        servInitArray[servoIndex].writeSync(0);
        servTimeoutArray[trigs[i].servo] = setTimeout(() => {
          servInitArray[servoIndex].writeSync(1);
          servTimeoutArray[trigs[i].servo] = null;
        }, trigs[i].duration);
      } else if (trigs[i].type === 'lesser' && valArray[trigs[i].sensor] < trigs[i].value) {
        servInitArray[servoIndex].writeSync(0);
        servTimeoutArray[trigs[i].servo] = setTimeout(() => {
          servInitArray[servoIndex].writeSync(1);
          servTimeoutArray[trigs[i].servo] = null;
        }, trigs[i].duration);
      }
    }
  }, trigs[i].intv));
}

function sendMessage() {
  eventEmitter.emit('send-message', valArray);
  console.log('send message', valArray);
  return;
}

var readPoll = setInterval(() => {
  for (let i = 0; i < sensArray.length; i++) {
    sensInitArray[i].read((err, value) => {
      if (err) {
        throw err;
      }
      
      valArray[sensArray[i].name] = value;
    });
  };
  for (let i = 0; i < servArray.length; i++) {
    servInitArray[i].read((err, value) => {
      if (err) {
        throw err;
      }
      
      valArrayServ[servArray[i].name] = value;
    });
  };
  messageSensor = valArray;
  messageServo = valArrayServ;
  console.log('message', JSON.stringify(messageSensor));
  console.log('messageServ', JSON.stringify(messageServo));
  //sendMessage();
}, 3000);

//setTimeout(() => {
  //servInitArray[0].writeSync(0);
//}, 10000);

app.get("/api", (req, res) => {
  res.json({ message: "Hello from server!" });
});

server.listen(PORT, () => {
  console.log(`Server listening on ${PORT}`);
  console.log(servInitArray);
  //servInitArray[0].writeSync(0);
  //servInitArray[0].writeSync(1);
});

//var wsIntv = null;

//app.ws('/echo', (ws, req) => {

    //ws.on('close', () => {
        //console.log('WebSocket was closed')
    //})

    //ws.on('open', () => {
        //console.log('Websocket open');
    //})
    
    //eventEmitter.on('send-message', (msg) => ws.send(JSON.stringify(msg)));
    ////wsIntv = setInterval(() => {    
      
      ////if (message) {
        ////ws.send(JSON.stringify(valArray));
        ////console.log('ws message:', JSON.stringify(valArray));
      ////};
      
    ////}, 3000);
//})
function noop() {};

function heartbeat() {
  console.log('heartbeat');
  this.isAlive = true;
};

wss.on('connection', function connection(ws) {
  ws.on('message', function incoming(msg) {
    console.log('received: %s', msg);
    if (msg === 'sensor') {
      ws.send(JSON.stringify(messageSensor));
    } else if (msg === 'servo') {
      ws.send(JSON.stringify(messageSensor));
    }
  });
  //eventEmitter.on('send-message', (msg) => ws.send(JSON.stringify(msg)));
  //ws.send('something');
  console.log('wss connection');
  ws.isAlive = true;
  ws.on('pong', heartbeat);
  ws.on('close', () => console.log('wson close'));
});

const interval = setInterval(function ping() {
  wss.clients.forEach(function each(ws) {
    if (ws.isAlive === false) {console.log('terminate'); return ws.terminate();}
    
    ws.isAlive = false;
    ws.ping(noop);
  });
}, 10000);

wss.on('close', function close() {
  clearInterval(interval);
  console.log('wss close');
});


process.on('SIGINT', _ => {
  clearInterval(readPoll);
  clearInterval(interval);
  
  for (let i = 0; i < trigArray.length; i++) {
    clearInterval(trigArray[i]);
  };
  for (const timeout in servTimeoutArray) {
    if (timeout) clearTimeout(timeout);
  };
  for (let i = 0; i < sensInitArray.length; i++) {
    sensInitArray[i].unexport();
  };
  for (let i = 0; i < servInitArray.length; i++) {
    if (servArray[i].init === 'high') {
      servInitArray[i].writeSync(1);
    } else {
      servInitArray[i].writeSync(0);
    };
    servInitArray[i].unexport();
  };
  wss.clients.forEach(function each(ws) {
    ws.close();
  });
  server.close();
});
  
