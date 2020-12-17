import * as sha from "js-sha512";

export class Logger {
    color;

    static loadingFrames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

    constructor(public unit: string) {
        const hash = sha.sha512(unit);

        this.color = hash.split("").reduce((a, c) => a + parseInt(c, 16), 0) % 230;
    }

    log(...text: string[]) {
        process.stdout.write(`[   \x1b[38;5;${this.color}m${this.unit}\x1b[0m ]\t${text.join("")}\n`);
    }

    async process(text: string[] | string, handler: (finished: (...text: string[]) => void) => {}) {
        let i = 0;

        process.stdout.write(`[ ${Logger.loadingFrames[0]} \x1b[38;5;${this.color}m${this.unit}\x1b[0m ]\t${Array.isArray(text) ? text.join("") : text}\r`);

        const interval = setInterval(() => {
            process.stdout.write(`[ ${Logger.loadingFrames[i++ % (Logger.loadingFrames.length - 1)]}\r`);
        }, 100);
        
        try {
            let result;

            await handler((...text: string[]) => {
                result = text;
            });

            clearInterval(interval);

            process.stdout.write(`[ ✔${result ? ` \x1b[38;5;${this.color}m${this.unit}\x1b[0m ]\t${result.join("")}` : ""}\n`);
        } catch (e) {
            clearInterval(interval);

            process.stdout.write(`[ ✗\n`);

            throw e;
        }
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

    w(worker: string) {
        return `<${worker}>`;
    }

    c(worker: string) {
        return `{${worker}}`;
    }

    g(worker: string) {
        return `#${worker}`;
    }
}