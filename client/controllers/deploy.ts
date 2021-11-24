import { spawn } from "child_process";
import path = require("path");
import fs = require("fs");
import { Logger } from "../../shared/log";
import { Cluster } from "../../shared/cluster";
import { Request } from "../../shared/request";
import { Client } from "../client";

export class DeployClientController {
    logger = new Logger("ssl");

    constructor(public client: Client) {}

    static async build(directory: string, dockerfile?: string) {
		const logger = new Logger("build");
		const packagePath = path.join(directory, "package.json");

		if (!fs.existsSync(packagePath)) {
			throw new Error(`no package.json found in ${directory}`);
		}

		const packageConfiguration = JSON.parse(fs.readFileSync(packagePath).toString());

		if (!packageConfiguration.name) {
			throw new Error(`no name in ${packagePath} set!`);
		}

		if (!packageConfiguration.version) {
			throw new Error(`no version in ${packagePath} set!`);
		}

		const args = [
			"-t", `${packageConfiguration.name}:${packageConfiguration.version}` // tag container
		];

		// add -f dockerfile option if present
		if (dockerfile) {
			args.push("-f", dockerfile);
		}

		logger.log("building ", logger.av(packageConfiguration.name, packageConfiguration.version), "...");
		const buildProcess = spawn("docker", [
			"build", 
			...args,
			"."
		], {
			cwd: directory,
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

		logger.log("image ", logger.av(packageConfiguration.name, packageConfiguration.version), " built!");

		return {
			application: packageConfiguration.name,
			version: packageConfiguration.version
		};
	}

	async push(application: string, version: string) {
		const logger = new Logger("push");

		const imageName = `${application}:${version}`;

		let meta;

		await logger.process(["fetching metadata ", logger.av(application, version), "..."], async finished => {
			const inspectProcess = spawn("docker", ["inspect", imageName], {
				stdio: "pipe"
			});

			let output = "";

			inspectProcess.stdout.on("data", data => {
				output += data;
			});

			inspectProcess.on("close", code => {
				if (code) {
					throw new Error(`Can't fetch metadata of '${imageName}'.`);
				}

				meta = JSON.parse(output)[0];

				finished("fetched metadata");
			});
		});

		const size = meta.Size;

		await logger.process(["pushing ", logger.av(application, version), " (", logger.size(size), ")..."], async finished => {
			const saveProcess = spawn("docker", ["save", imageName], {
				stdio: [
					"ignore",
					"pipe",
					process.stderr
				]
			});

			const request = new Request(this.client.configuration.host, Cluster.api.registry.push)
				.auth(this.client.configuration.name, this.client.configuration.key)
				.append("application", application)
				.append("version", version)
				.append("image-name", imageName)
				.appendBody(saveProcess.stdout)
				.send();

			await new Promise<void>((done, reject) => {
				request.catch(error => reject(error));

				saveProcess.on("close", async () => {
					finished(logger.av(application, version), " pushed");

					done();
				});
			});
		});
	}

	async upgrade(application: string, version: string, env: string, instances: number) {
		const logger = new Logger("upgrade");
		
		await logger.process(["upgrading ", logger.aev(application, env, version), "..."], async finished => {
			const info = await new Request(this.client.configuration.host, Cluster.api.registry.upgrade)
				.auth(this.client.configuration.name, this.client.configuration.key)
				.append("application", application)
				.append("version", version)
				.append("env", env)
				.append("instances", instances || 1)
				.send();

			finished("upgraded ", logger.aev(application, env, version));

			for (let instance of info.started) {
				logger.log("started ", logger.wi(instance.name, instance.worker.name));
			}

			for (let instance of info.stopped) {
				logger.log("stopped ", logger.wi(instance.name, instance.worker.name));
			}
		});
	}

	async deploy(directory: string, env: string, instances: number) {
		const app = await DeployClientController.build(directory);

		await this.push(app.application, app.version);
		await this.upgrade(app.application, app.version, env, instances);
	}
}