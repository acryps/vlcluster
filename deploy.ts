import { spawn } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as fetch from "node-fetch";
import { Client } from "./client/client";
import { Cluster } from "./cluster";
import { Crypto } from "./crypto";

export class Deployer {
	package: {
		name: string;
		version: string;
	};

	constructor(
		private directory: string,
		private clusterName: string
	) {
		if (!fs.existsSync(directory)) {
			throw new Error(`cannot deploy '${directory}'. directory does not exist!`);
		}

		if (!fs.existsSync(path.join(directory, "Dockerfile"))) {
			throw new Error(`cannot deploy '${directory}'. no Dockerfile found!`);
		}

		if (!fs.existsSync(path.join(directory, "package.json"))) {
			throw new Error(`cannot deploy '${directory}'. no package.json found!`);
		}

		const packageConfiguration = JSON.parse(
			fs.readFileSync(path.join(directory, "package.json")).toString()
		);

		if (!packageConfiguration.name) {
			throw new Error(`cannot deploy '${directory}'. no name in package.json set!`);
		}

		if (!packageConfiguration.version) {
			throw new Error(`cannot deploy '${directory}'. no version in package.json set!`);
		}

		if (!Client.hasCluster(clusterName)) {
			throw new Error(`cannot deploy '${directory}'. cluster '${clusterName}' not found. Did you run 'vlcluster init'?`);
		}

		this.package = {
			name: packageConfiguration.name,
			version: packageConfiguration.version
		}
	}

	async deploy() {
		const imageId = Crypto.createKey().substr(0, 16);

		console.log(`[ deploy ] building docker image...`);
		const buildProcess = spawn("docker", ["build", "-t", imageId, "."], {
			cwd: this.directory,
			stdio: "pipe"
		});

		await new Promise(done => {
			buildProcess.on("close", () => {
				done();
			})
		});

		console.log(`[ deploy ] exporting docker image...`);
		const saveProcess = spawn("docker", ["save", "-o", imageId, imageId], {
			cwd: this.directory,
			stdio: "pipe"
		});

		await new Promise(done => {
			saveProcess.on("close", () => {
				done();
			})
		});
		
		console.log(`[ deploy ] creating image '${this.package.name}' v${this.package.version} in registry...`);
		const client = new Client(this.clusterName);

		const result = await fetch(`http://${client.host}:${Cluster.port}${Cluster.api.registry.createImage}`, {
			method: "POST",
			headers: {
				"content-type": "application/json"
			},
			body: JSON.stringify({
				key: client.key,
				username: client.username,
				package: this.package
			})
		}).then(r => r.json());
	}
}