import { Cluster } from "../cluster";

import * as path from "path";
import { Crypto } from "../crypto";

export class RegistryPath {
    static get rootDirectory() {
		return path.join(Cluster.localDirectory, "registry");
	}

	static get keyFile() {
		return path.join(this.rootDirectory, "key");
	}

	static get nameFile() {
		return path.join(this.rootDirectory, "name");
	}

	static get applicationsDirectory() {
		return path.join(this.rootDirectory, "applications");
	}

	static applicationDirectory(name: string) {
		return path.join(this.applicationsDirectory, Crypto.sanitizeApplicationName(name));
	}

	static applicationVersionsDirectory(name: string) {
		return path.join(this.applicationDirectory(name), "versions");
	}

	static applicationEnvsDirectory(name: string) {
		return path.join(this.applicationDirectory(name), "envs");
	}

	static applicationEnvDirectory(name: string, env: string) {
		return path.join(this.applicationEnvsDirectory(name), Crypto.sanitizeEnv(env));
	}

	static applicationEnvLatestVersionFile(name: string, env: string) {
		return path.join(this.applicationEnvDirectory(name, env), "latest");
	} 

	static applicationEnvDangelingVersionFile(name: string, env: string) {
		return path.join(this.applicationEnvDirectory(name, env), "dangeling");
	} 

	static applicationEnvActiveVersionsDirectory(name: string, env: string) {
		return path.join(this.applicationEnvDirectory(name, env), "active-versions");
	} 

	static applicationEnvActiveVersionDirectory(name: string, env: string, version: string) {
		return path.join(this.applicationEnvActiveVersionsDirectory(name, env), Crypto.sanitizeVersion(version));
	} 

	static applicationEnvActiveVersionWorkerDirectory(name: string, env: string, version: string, worker: string) {
		return path.join(this.applicationEnvActiveVersionDirectory(name, env, version), Crypto.sanitizeWorkerName(worker));
	} 

	static applicationEnvActiveVersionWorkerInstanceFile(name: string, env: string, version: string, worker: string, instance: string) {
		return path.join(this.applicationEnvActiveVersionWorkerDirectory(name, env, version, worker), Crypto.sanitizeInstanceName(instance));
	}

	static applicationVersionDirectory(name: string, version: string) {
		return path.join(this.applicationVersionsDirectory(name), Crypto.sanitizeVersion(version));
	}

	static applicationVersionImageSourceFile(name: string, version: string) {
		return path.join(this.applicationVersionDirectory(name, version), "source");
	}

	static applicationVersionImageIdFile(name: string, version: string) {
		return path.join(this.applicationVersionDirectory(name, version), "id");
	}

	static get workersDirectory() {
		return path.join(this.rootDirectory, "workers");
	}

	static workerDirectory(name: string) {
		return path.join(this.workersDirectory, Crypto.sanitizeWorkerName(name));
	}

	static workerKeyFile(name: string) {
		return path.join(this.workerDirectory(name), "key");
	}

	static get clientsDirectory() {
		return path.join(this.rootDirectory, "clients");
	}

	static clientDirectory(name: string) {
		return path.join(this.clientsDirectory, Crypto.sanitizeUsername(name));
	}

	static clientKeyFile(name: string) {
		return path.join(this.clientDirectory(name), "key");
	}
}