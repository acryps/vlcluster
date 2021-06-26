import { Logger } from "../../shared/log";
import { Cluster } from "../../shared/cluster";
import { Request } from "../../shared/request";
import { Client } from "../client";

export class VariablesClientController {
    logger = new Logger("variables");

    constructor(public client: Client) {}
    
    async list(application?: string, env?: string) {
        return await new Request(this.client.configuration.host, Cluster.api.registry.variables.list)
            .auth(this.client.configuration.name, this.client.configuration.key)
            .append("name", application)
            .append("env", env)
            .send<{ id, name, value, application?, env? }[]>();
	}

    async set(name: string, value: string, application: string, env: string) {
		await this.logger.process(["setting ", name, " to ", value, " on ", this.logger.ae(application || "*", env || "*"), "..."], async finished => {
			await new Request(this.client.configuration.host, Cluster.api.registry.variables.set)
				.auth(this.client.configuration.name, this.client.configuration.key)
				.append("name", name)
				.append("value", value)
				.append("application", application)
				.append("env", env)
				.send();

			finished("set ", name, " to ", value, " on ", this.logger.ae(application || "*", env || "*"));
		});
	}
}