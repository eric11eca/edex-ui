// Worker process for systeminformation calls
// This file runs as a separate cluster worker process
// It must use require() because cluster workers run as separate Node.js processes
const si = require('systeminformation');

console.log("Multithread worker started at " + process.pid);

process.on("message", msg => {
  msg = JSON.parse(msg);
  si[msg.type](msg.arg).then(res => {
    process.send(JSON.stringify({
      id: msg.id,
      res,
    }));
  });
});
