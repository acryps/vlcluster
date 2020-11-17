import * as path from "path";
import * as fs from "fs";

let parameters = process.argv.slice(1);
const root = path.resolve("~/.vlcluster");

if (!fs.existsSync(root)) {
	fs.mkdirSync(root);
}

console.log(parameters);