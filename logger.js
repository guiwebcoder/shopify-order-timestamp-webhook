import fs from 'fs';
import path from 'path';

// Ensure logs folder exists
const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir);
}

// Append log message to a daily log file
export function logMessage(message) {
  const timestamp = new Date().toISOString();
  const logLine = `[${timestamp}] ${message}\n`;
  const logFile = path.join(logsDir, `${new Date().toISOString().slice(0, 10)}.log`);
  
  fs.appendFile(logFile, logLine, err => {
    if (err) console.error('Failed to write log:', err);
  });
  
  console.log(logLine.trim());
}
