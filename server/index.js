// server/index.js
const http = require('http');
const fs = require('fs');
const express = require("express");
const expressWs = require('express-ws');

const WebSocket = require('ws');

const key = fs.readFileSync('./key.pem');
const cert = fs.readFileSync('./cert.pem');

const app = express();
const bodyParser = require("body-parser");
const router = express.Router();

const cors = require('cors');

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

app.use(cors({
    origin: '*'
}));

const server = http.createServer({key: key, cert: cert }, app);


const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3001;

const Gpio = require('onoff').Gpio;

var mysql = require('mysql2/promise');

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

var sensors, servos, triggers;
var sensorFields, servoFields, triggerFields;

var config = [];
var trigs = [];

var flags = {};
var flagArray = [];
var flagsTimeoutArray = [];

//~ const trigs = [
  //~ {
    //~ sensor: 'sensor1',
    //~ servo: 'pump1',
    //~ type: 'lesser',
    //~ value: 1,
  //~ },
//~ ];

var connection;

// LOG VARs

var pollLog = false;
var messageLog = false;
var flagLog = false;

// CONFIG VARs

var shouldSqlPoll = false;
var shouldSetup = true;
var shouldReadPoll = true;

// MAIN FUNCTION

async function main() {
  connection = await mysql.createConnection({
      host: 'localhost',
      user: 'user',
      password: '1234',
      database: 'pidb'
  });
  
  await getDevices();
  
  if (shouldSetup) setup();
  
};

async function getSensors() {
  [sensors, sensorFields] = await connection.execute('SELECT * FROM sensors');
}  

async function getServos() {
  [servos, servoFields] = await connection.execute('SELECT * FROM servos');
}  

async function getTriggers() {
  [triggers, triggerFields] = await connection.execute('SELECT * FROM triggers');
}  

async function getDevices() {
  //~ [sensors, sensorFields] = await connection.execute('SELECT * FROM sensors');
  //~ [servos, servoFields] = await connection.execute('SELECT * FROM servos');
  //~ [triggers, triggerFields] = await connection.execute('SELECT * FROM triggers');
  await getSensors();
  await getServos();
  await getTriggers();
  
  sensors.forEach((item) => {
    console.log('sensor item', item);
    config.push({
      name: item.name,
      mode: 'input',
      pin: item.pin,
    });
  });
  
  servos.forEach((item) => {
    console.log('servo item', item);
    config.push({
      name: item.name,
      mode: 'output',
      pin: item.pin,
      init: item.init ? 'high' : 'low',
      intv: item.intv,
    });
  });
  
  triggers.forEach((item) => {
    console.log('trigger item', item);
    trigs.push(item);
  });
}

function setup() {
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
  
  servos.forEach((item) => {
    flags[item.name] = [];
    flagsTimeoutArray[item.name] = [];
    flagArray.push(setInterval(() => {
      if (flagLog) console.log('flag interval', flags[item.name]);
      let servoIndex = servArray.findIndex((serv) => serv.name === item.name);
      if (Object.keys(flags[item.name]).length > 0 && Object.entries(flags[item.name]).findIndex(([key, value]) => value == false) == -1) {
        if (flagLog) console.log('flag on');
        switchServo(servoIndex, 'on');
      } else {
        if (flagLog) console.log('flag off');
        switchServo(servoIndex, 'off');
      };
    }, item.intv));
  })
  
  for (let i = 0; i < trigs.length; i += 1) {
    flags[trigs[i].servo][trigs[i].sensor] = false;
    trigArray.push(setInterval(() => {
      let servoIndex = servArray.findIndex((item) => item.name === trigs[i].servo);
      if (pollLog) {
        console.log('trigger', servoIndex);
      };
      if (valArray[trigs[i].sensor] !== null && valArrayServ[trigs[i].servo] !== null) {
        if (trigs[i].type === 'bigger') {
          if (valArray[trigs[i].sensor] > trigs[i].value) flags[trigs[i].servo][trigs[i].sensor] = true;
          else flags[trigs[i].servo][trigs[i].sensor] = false;
        } else if (trigs[i].type === 'lesser') {
          if (valArray[trigs[i].sensor] < trigs[i].value) flags[trigs[i].servo][trigs[i].sensor] = true;
          else flags[trigs[i].servo][trigs[i].sensor] = false;
        }
      }
    }, trigs[i].intv));
  }
  
  //~ console.log('setup flags', flags);
  //~ console.log('setup flagsTimeoutArray', flagsTimeoutArray);
}

main();

// FUNCTIONS

function sendMessage() {
  eventEmitter.emit('send-message', valArray);
  console.log('send message', valArray);
  return;
}

function switchServo(servoIdx, cond) {
  if (servInitArray && servInitArray[servoIdx] && servArray && servArray[servoIdx]) {
    if (servArray[servoIdx].init === 'high') {
      if (cond === 'on') servInitArray[servoIdx].writeSync(0);
      else servInitArray[servoIdx].writeSync(1);
    } else if (servArray[servoIdx].init === 'low') {
      if (cond === 'on') servInitArray[servoIdx].writeSync(1);
      else servInitArray[servoIdx].writeSync(0);
    }
  }
}

var readPoll = setInterval(() => {
  if (shouldReadPoll) {
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
    if (pollLog) {
      console.log('message', JSON.stringify(messageSensor));
      console.log('messageServ', JSON.stringify(messageServo));
      //~ console.log('servtimeout', servTimeoutArray);
    };
  }
  //sendMessage();
}, 3000);

var sqlPoll = setInterval(() => {
  if (pollLog) {
    console.log('sqopoll val array', Object.entries(valArray));
  };
  if (shouldSqlPoll) {
    let tempArr = valArray;
    for (const [key, value] of Object.entries(tempArr)) {
      //~ console.log('sql poll', key, value);
      if (value == null || key == null) continue;
      //~ console.log('continued');
      try {
        let q = "INSERT INTO sensor_log (name, value) VALUES (?, ?)";
        connection.query(q, [key, value], function (err, result) {
          if (err) throw err;
          //~ console.log('record inserted');
        });
      }
      catch (err) {
        console.log('error insert');
      }
    };
  };
}, 3000);

//setTimeout(() => {
  //servInitArray[0].writeSync(0);
//}, 10000);

app.get("/api", (req, res) => {
  res.json({ message: "Hello from server!" });
});

app.get("/sensor", (req, res) => {
  res.send(sensors);
  res.end();
});

app.get("/servo", (req, res) => {
  res.send(servos);
  res.end();
});

app.get("/trigger", (req, res) => {
  res.send(triggers);
  res.end();
});

app.get("/all", (req, res) => {
  res.send({
    sensors: sensors,
    servos: servos,
    triggers: triggers,
  });
  res.end();
});

app.post("/sensor", (req, res) => {
  let q = "INSERT INTO sensors (name, type, pin) VALUES (?, ?, ?)";
  connection.execute(q, [req.body.name, req.body.type, req.body.pin]).then(function (result) {
    console.log('sensor inserted');
    getSensors();
    res.send(result);
  }).catch(err => {
    console.log('error sensor insert', err);
    res.status(500).send(err);
  }).finally(() => {
    res.end();
  });
});

app.put("/sensor/:id", (req, res) => {
  let q = "UPDATE sensors SET name=?, type=?, pin=? WHERE id=?";
  connection.execute(q, [req.body.name, req.body.type, req.body.pin, req.params.id]).then(function (result) {
    console.log('sensor updated');
    getSensors();
    res.send(result);
  }).catch(err => {
    console.log('error sensor update', err);
    res.status(500).send(err);
  }).finally(() => {
    res.end();
  });
});

app.get("/sensor/:id", (req, res) => {
  console.log('get history');
  //~ let q = "SELECT name from sensors WHERE id=?";
  let q = "SELECT sensor_log.name, value, time from (SELECT name FROM sensors WHERE id LIKE ?) C JOIN sensor_log ON C.name=sensor_log.name";
  connection.execute(q, [req.params.id]).then(function (result) {
    console.log('getted');
    res.send(result);
  }).catch(err => {
    console.log('error sensor delete', err);
    res.status(500).send(err);
  }).finally(() => {
    res.end();
  });
});

app.delete("/sensor/:id", (req, res) => {
  console.log('delete');
  let q = "DELETE from sensors WHERE id=?";
  connection.execute(q, [req.params.id]).then(function (result) {
    console.log('sensor deleted');
    getSensors();
    res.send(result);
  }).catch(err => {
    console.log('error sensor delete', err);
    res.status(500).send(err);
  }).finally(() => {
    res.end();
  });
});

app.post("/servo", (req, res) => {
  let q = "INSERT INTO servos (name, pin, init, intv) VALUES (?, ?, ?, ?)";
  connection.execute(q, [req.body.name, req.body.pin, req.body.init, req.body.intv]).then(function (result) {
    console.log('servo inserted');
    getServos();
    res.send(result);
  }).catch(err => {
    console.log('error servo insert', err);
    res.status(500).send(err);
  }).finally(() => {
    res.end();
  });
});

app.put("/servo/:id", (req, res) => {
  let q = "UPDATE servos SET name=?, pin=?, init=?, intv=? WHERE id=?";
  connection.execute(q, [req.body.name, req.body.pin, req.body.init, req.body.intv, req.params.id]).then(function (result) {
    console.log('servo updated');
    getServos();
    res.send(result);
  }).catch(err => {
    console.log('error servo update', err);
    res.status(500).send(err);
  }).finally(() => {
    res.end();
  });
});

app.delete("/servo/:id", (req, res) => {
  let q = "DELETE from servos WHERE id=?";
  connection.execute(q, [req.params.id]).then(function (result) {
    console.log('servo deleted');
    getServos();
    res.send(result);
  }).catch(err => {
    console.log('error servo delete', err);
    res.status(500).send(err);
  }).finally(() => {
    res.end();
  });
});

app.post("/trigger", (req, res) => {
  let q = "INSERT INTO triggers (sensor, servo, type, value, intv) VALUES (?, ?, ?, ?, ?)";
  connection.execute(q, [req.body.sensor, req.body.servo, req.body.type, req.body.value, req.body.intv]).then(function (error, result) {
    console.log('trigger inserted');
    getTriggers();
    res.send('Success');
  }).catch(err => {
    console.log('error trigger insert', err);
    res.status(500).send(err);
  }).finally(() => {
    res.end();
  });
});

app.put("/trigger/:id", (req, res) => {
  let q = "UPDATE triggers SET sensor=?, servo=?, type=?, value=?, intv=? WHERE id=?";
  connection.execute(q, [req.body.sensor, req.body.servo, req.body.type, req.body.value, req.body.intv, req.params.id]).then(function (result) {
    console.log('trigger updated');
    getTriggers();
    res.send(result);
  }).catch(err => {
    console.log('error trigger update', err);
    res.status(500).send(err);
  }).finally(() => {
    res.end();
  });
});

app.delete("/trigger/:id", (req, res) => {
  let q = "DELETE from triggers WHERE id=?";
  connection.execute(q, [req.params.id]).then(function (result) {
    console.log('triger deleted');
    getTriggers();
    res.send(result);
  }).catch(err => {
    console.log('error trigger delete', err);
    res.status(500).send(err);
  }).finally(() => {
    res.end();
  });
});

server.listen(PORT, () => {
  console.log(`Server listening on ${PORT}`);
  console.log(servInitArray);
});

function noop() {};

function heartbeat() {
  if (messageLog) console.log('heartbeat');
  this.isAlive = true;
};

wss.on('connection', function connection(ws) {
  ws.on('message', function incoming(msg) {
    if (messageLog) console.log('received: %s', msg);
    if (msg === 'sensor') {
      ws.send(JSON.stringify(messageSensor));
    } else if (msg === 'servo') {
      ws.send(JSON.stringify(messageServo));
    } else if (msg === 'all') {
      ws.send(JSON.stringify({sensor: {...messageSensor},servo: {...messageServo}}));
    }
  });
  //eventEmitter.on('send-message', (msg) => ws.send(JSON.stringify(msg)));
  //ws.send('something');
  //~ console.log('wss connection');
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
  clearInterval(sqlPoll);
  clearInterval(interval);
  
  connection.end(function(err) {
    if (err) {
      return console.log('error:' + err.message);
    }
    console.log('Close the database connection.');
  });
  
  for (let i = 0; i < trigArray.length; i++) {
    clearInterval(trigArray[i]);
  };
  for (let i = 0; i < flagArray.length; i++) {
    clearInterval(flagArray[i]);
  };
  for (const timeout in servTimeoutArray) {
    if (timeout) clearTimeout(timeout);
  };
  for (const timeoutArray in flagsTimeoutArray) {
    if (timeoutArray.length > 0) {
      for (const timeout in timeoutArray) clearTimeout(timeout);
    }
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
  
