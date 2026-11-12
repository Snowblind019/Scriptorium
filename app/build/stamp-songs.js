// Gives every song that ships with Scriptorium (app/data/songs) a permanent id and a hash, so the
// copies on different computers can be merged. Edits made to those files by hand are recorded as
// a new version. Runs automatically before every build (npm run dist:*); safe to run again.
const path = require('path');
const { stampFolder } = require('../songdb');
const dir = process.argv[2] ? path.resolve(process.argv[2]) : path.join(__dirname, '..', 'data', 'songs');
console.log(`songs: ${stampFolder(dir)} file(s) updated in ${dir}`);
