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

	client: Client;

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

		this.client = new Client(this.clusterName);
	}

	async deploy() {
		const imageId = Crypto.dockerImageKey();

		console.log(`[ deploy ]\tbuilding docker image...`);
		const buildProcess = spawn("docker", ["build", "-t", imageId, "."], {
			cwd: this.directory,
			stdio: [
				"ignore",
				process.stdout,
				process.stderr
			]
		});

		await new Promise<void>((done, reject) => {
			buildProcess.on("close", code => {
				if (code) {
					return reject(new Error("docker build failed!"));
				}

				done();
			})
		});

		console.log(`[ deploy ]\tcreating image '${this.package.name}' v${this.package.version} in registry...`);

		const uploadRequestResult = await fetch(`http://${this.client.host}:${Cluster.port}${Cluster.api.registry.createImage}`, {
			method: "POST",
			headers: {
				"content-type": "application/json"
			},
			body: JSON.stringify({
				key: this.client.key,
				username: this.client.username,
				name: this.package.name,
				version: this.package.version
			})
		}).then(r => r.json());

		console.log(`[ deploy ]\texporting and uploading docker image...`);
		
		const saveProcess = spawn("docker", ["save", imageId], {
			cwd: this.directory,
			stdio: [
				"ignore",
				"pipe",
				process.stderr
			]
		});

		const uploader = fetch(`http://${this.client.host}:${Cluster.port}${Cluster.api.registry.uploadImage}`, {
			method: "POST", 
			headers: {
				"cluster-application": this.package.name,
				"cluster-version": this.package.version,
				"cluster-key": uploadRequestResult.key
			},
			body: saveProcess.stdout
		}).then(r => r.json());

		await new Promise<void>(done => {
			saveProcess.on("close", async () => {
				const res = await uploader;

				console.log(`[ deploy ]\timage uploaded (${res.size})!`);

				done();
			})
		});

		return uploadRequestResult.key;
	}

	async upgrade(key: string, env: string) {
		await fetch(`http://${this.client.host}:${Cluster.port}${Cluster.api.registry.upgrade}`, {
			method: "POST",
			headers: {
				"cluster-application": this.package.name,
				"cluster-version": this.package.version,
				"cluster-key": key,
				"cluster-env": env
			}
		}).then(r => r.json());

		console.log("APPLICATION UPGRADE REQUEST SUBMITTED!!!")
	}
}