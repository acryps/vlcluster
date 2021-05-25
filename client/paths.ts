import * as path from "path";
import { Cluster } from "../shared/cluster";

export class ClientPath {
    static clusterDirectory(name: string) {
		return path.join(Cluster.clustersDirectory, name);
	}

	static clusterKeyFile(name: string) {
		return path.join(this.clusterDirectory(name), "key");
	}

	static clusterUsernameFile(name: string) {
		return path.join(this.clusterDirectory(name), "username");
	}

	static clusterHostFile(name: string) {
		return path.join(this.clusterDirectory(name), "host");
	}
}