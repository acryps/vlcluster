import fs = require("fs"); 

import { Logger } from "../../shared/log";
import { Crypto } from "../../shared/crypto";
import { RegistryServer } from "../registry";
import { Handler } from "../../shared/handler";
import { Cluster } from "../../shared/cluster";
import { Configuration } from "../../shared/configuration";

export class CreateRegistryController {
    logger = new Logger("create");

    constructor(private registry: RegistryServer) {}

    static async registry(name: string) {
		// generate key
		const key = Crypto.createKey();

		Configuration.registry = {
			name,
			key,
			workers: [],
			clients: [],
			gateways: [],
			applications: [],
			variables: []
		};

		Configuration.save();

		return key;
	}

	register(app) {
		new Handler(app, Cluster.api.registry.create.worker, async params => {
			if (this.registry.configuration.key != params.key) {
				throw new Error("invalid key login attepted");
			}

			return {
				name: this.registry.configuration.name,
				key: await this.worker(params.name, params.endpoint)
			};
		});

		new Handler(app, Cluster.api.registry.create.client, async params => {
			if (this.registry.configuration.key != params.key) {
				throw new Error("invalid key login attepted");
			}

			return {
				name: this.registry.configuration.name,
				key: await this.client(params.username)
			};
		});

		new Handler(app, Cluster.api.registry.create.gateway, async params => {
			if (this.registry.configuration.key != params.key) {
				throw new Error("invalid key login attepted");
			}

			return {
				name: this.registry.configuration.name,
				key: await this.gateway(params.name, params.host)
			};
		});
	}

    worker(name: string, endpoint: string) {
		this.logger.log("creating worker ", this.logger.w(name));

		if (this.registry.configuration.workers.find(w => w.name == name)) {
			throw new Error("worker already registered");
		}

		const key = Crypto.createKey();

		Configuration.registry.workers.push({
			name,
			key,
			endpoint,
			running: false,
			cpuUsage: null,
			lastSeen: null
		});

		Configuration.save();

		this.logger.log("created worker ", this.logger.w(name));

		return key;
	}

	client(name: string) {
		const key = Crypto.createKey();

		this.logger.log(`creating client ${name}`);

		if (this.registry.configuration.clients.find(w => w.name == name)) {
			throw new Error(`client '${name}' already exists!`);
		}

		Configuration.registry.clients.push({
			name,
			key
		});

		Configuration.save();

		this.logger.log("created client");

		return key;
	}

	gateway(name: string, host: string) {
		const key = Crypto.createKey();

		this.logger.log(`creating gateway ${name}`);

		if (this.registry.configuration.gateways.find(g => g.name == name)) {
			throw new Error(`gateway '${name}' already exists!`);
		}

		Configuration.registry.gateways.push({
			name,
			key,
			endpoint: host
		});

		Configuration.save();

		this.logger.log("created gateway");

		return key;
	}
}