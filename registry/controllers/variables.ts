import { Logger } from "../../shared/log";
import { RegistryServer } from "../registry";
import fs = require("fs");
import { Crypto } from "../../shared/crypto";
import { Handler } from "../../shared/handler";
import { Cluster } from "../../shared/cluster";
import { Application } from "../../shared/models/application";
import { Environnement } from "../../shared/models/environnement";
import { Variable } from "../../shared/models/variable";
import { Configuration } from "../../shared/configuration";

export class VariablesRegistryController {
    logger = new Logger("variables");

    constructor(private registry: RegistryServer) {}

    register(app) {
        new Handler(app, Cluster.api.registry.variables.set, async params => {
			const name = params.name;
			const value = JSON.parse(params.value);
			const application = params.application;
			const env = params.env;

			this.logger.log("setting ", name, " to ", value, " for ", this.logger.ae(application || "*", env || "*"));
			await this.set(name, value, application, env);

			return {};
		});

        new Handler(app, Cluster.api.registry.variables.list, async params => {
			const application = params.name;
			const env = params.env;
			
			return this.list(application, env);
		});
    }

    list(applicationFilter: string, envFilter: string) {
		const variables: Variable[] = [];
		
		for (let variable of this.registry.configuration.variables) {
			let add = true;

			if (applicationFilter && variable.applicationFilter && applicationFilter != variable.applicationFilter) {
				add = false;
			}

			if (envFilter && variable.envFilter && envFilter != variable.envFilter) {
				add = false;
			}

			if (add) {
				variables.push(variable);
			}
		}
		
		return variables;
	}

	constructActive(application: Application, env: Environnement) {
		// sort variables by priority
		const variables = this.list(application.name, env.name).sort((a, b) => {
			if (a.name == b.name) {
				if (a.applicationFilter == b.applicationFilter) {
					if (a.envFilter == b.envFilter) {
						return 0;
					} else {
						return a.envFilter ? 1 : -1;
					}
				} else {
					return a.applicationFilter ? 1 : -1;
				}
			} else {
				return a.name > b.name ? 1 : -1;
			}
		});

		// condense list
		const constructed = {};

		for (let variable of variables) {
			constructed[variable.name] = variable.value;
		}

		return constructed;
	}

    async set(name: string, value: string, applicationFilter: string, envFilter: string) {
		// try to find existing variable
		for (let variable of this.registry.configuration.variables) {
			if (variable.name == name && variable.applicationFilter == applicationFilter && variable.envFilter == envFilter) {
				variable.value = value;

				return;
			}
		}

		const variable: Variable = {
			name,
			value,
			applicationFilter,
			envFilter
		};

		this.registry.configuration.variables.push(variable);
		Configuration.save();
	}
}