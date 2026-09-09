import { buildProgram, fail } from './program.js';

buildProgram().parseAsync(process.argv).catch(fail);
