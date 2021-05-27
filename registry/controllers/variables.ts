import { Logger } from "../../shared/log";
import { RegistryPath } from "../paths";
import { RegistryServer } from "../registry";
import fs = require("fs");
import { Crypto } from "../../shared/crypto";
import { Handler } from "../../shared/handler";
import { Cluster } from "../../shared/cluster";

export class VariablesRegistryController {
    logger = new Logger("variables");

    constructor(private registry: RegistryServer) {}

    register(app) {
        new Handler(app, Cluster.api.registry.variables.set, async params => {
			const name = params.name;
			const value = params.value;
			const application = params.application;
			const env = params.env;

			this.logger.log("setting ", name, " to ", value, " for ", this.logger.ae(application || "*", env || "*"));
			await this.set(name, value, application, env);

			return {};
		});

        new Handler(app, Cluster.api.registry.variables.list, async params => {
			const application = params.name;
			const env = params.env;
			
			return this.list(application, env);
		});
    }

    list(application: string, env: string) {
		const variables: Variable[] = [];
		
		for (let id of fs.readdirSync(RegistryPath.variablesDirectory)) {
			let add = true;

			const variable = new Variable();
			variable.id = id;
			variable.name = fs.readFileSync(RegistryPath.variableNameFile(id)).toString();
			variable.value = fs.readFileSync(RegistryPath.variableValueFile(id)).toString();

			if (fs.existsSync(RegistryPath.variableApplicationFile(id))) {
				variable.application = fs.readFileSync(RegistryPath.variableApplicationFile(id)).toString();

				if (application && variable.application && application != variable.application) {
					add = false;
				}
			}

			if (fs.existsSync(RegistryPath.variableEnvFile(id))) {
				variable.env = fs.readFileSync(RegistryPath.variableEnvFile(id)).toString();

				if (env && variable.env && env != variable.env) {
					add = false;
				}
			}

			console.log(add ? "ADD" : "NOADD", variable.name, variable.value, `${application}=${variable.application}`, `${env}=${variable.env}`);
			
			if (add) {
				variables.push(variable);
			}
		}
		
		return variables;
	}

	constructActive(application: string, env: string) {
		const variables = this.list(application, env).sort((a, b) => {
			if (a.name == b.name) {
				if (a.application == b.application) {
					if (a.env == b.env) {
						return 0;
					} else {
						return a.env ? 1 : -1;
					}
				} else {
					return a.application ? 1 : -1;
				}
			} else {
				return a.name > b.name ? 1 : -1;
			}
		});

		const constructed = {};

		for (let variable of variables) {
			constructed[variable.name] = variable.value;
		}

		return constructed;
	}

    async set(name: string, value: string, application: string, env: string) {
		const id = Crypto.createId();

		fs.mkdirSync(RegistryPath.variableDirectory(id));

		fs.writeFileSync(RegistryPath.variableNameFile(id), name);
		fs.writeFileSync(RegistryPath.variableValueFile(id), value);

		if (application) {
			fs.writeFileSync(RegistryPath.variableApplicationFile(id), application);
		}

		if (env) {
			fs.writeFileSync(RegistryPath.variableEnvFile(id), env);
		}
	}
}

export class Variable {
	id: string;
	name: string;
	value: string;
	application?: string;
	env?: string
}