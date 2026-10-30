import {spawn} from 'node:child_process';
const proc=spawn(process.execPath,['--test'],{stdio:'inherit',env:{...process.env,NODE_ENV:'test',DATABASE_MODE:'pglite',FILE_STORAGE:'local'}});
proc.on('exit',code=>process.exit(code??1));
