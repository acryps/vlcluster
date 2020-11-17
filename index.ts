import * as path from "path";
import * as fs from "fs";
import * as os from "os";

export function main() {
	let parameters = process.argv.slice(1);
	const root = path.resolve(os.homedir(), ".vlcluster");

	console.log(`[vlc] root ${root}`);

	if (!fs.existsSync(root)) {
		fs.mkdirSync(root);
	}

	console.log(parameters);
}