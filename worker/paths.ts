import * as path from "path";

import { Cluster } from "../shared/cluster";
import { Crypto } from "../shared/crypto";

export class WorkerPath {
    static get rootDirectory() {
		return path.join(Cluster.localDirectory, "workers");
	}

	static workerDirectory(clusterName: string) {
		return path.join(this.rootDirectory, clusterName);
	}

	static keyFile(clusterName: string) {
		return path.join(this.workerDirectory(clusterName), "key");
	}

	static endpointFile(clusterName: string) {
		return path.join(this.workerDirectory(clusterName), "endpoint");
	}

	static nameFile(clusterName: string) {
		return path.join(this.workerDirectory(clusterName), "name");
	}

	static hostFile(clusterName: string) {
		return path.join(this.workerDirectory(clusterName), "host");
	}

	static instancesDirectory(clusterName: string) {
		return path.join(this.workerDirectory(clusterName), "instances");
    }
    
    static instanceDirectory(clusterName: string, instance: string) {
		return path.join(this.instancesDirectory(clusterName), Crypto.sanitizeInstanceName(instance));
	}

	static instanceApplicationFile(clusterName: string, instance: string) {
		return path.join(this.instanceDirectory(clusterName, instance), "application");
    }
    
    static instanceVersionFile(clusterName: string, instance: string) {
		return path.join(this.instanceDirectory(clusterName, instance), "version");
    }
    
    static instanceEnvFile(clusterName: string, instance: string) {
		return path.join(this.instanceDirectory(clusterName, instance), "env");
	}

	static instanceVariablesFile(clusterName: string, instance: string) {
		return path.join(this.instanceDirectory(clusterName, instance), "variables");
	}
}