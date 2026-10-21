import { spawn } from 'node:child_process';
// Maven Wrapper provides the same entry point on Windows and Unix.
const e2e = process.argv.includes('--e2e');
const args = ['spring-boot:run', ...(e2e ? ['-Dspring-boot.run.profiles=e2e'] : [])];
const child = process.platform === 'win32'
  ? spawn('cmd.exe', ['/d', '/s', '/c', 'mvnw.cmd', ...args], { stdio: 'inherit' })
  : spawn('sh', ['./mvnw', ...args], { stdio: 'inherit' });
child.on('error', error => { console.error(error); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
