export class Logger {
    constructor(public name: string) {

    }

    log(...text: string[]) {
        process.stdout.write(`[ ${this.name} ]\t${text.join("")}\n`);
    }

    av(application: string, version: string) {
        return `${application}:${version}`;
    }

    ae(application: string, env: string) {
        return `${application}[${env}]`;
    }

    aev(application: string, env: string, version: string) {
        return `${application}[${env}]:${version}`;
    }
}