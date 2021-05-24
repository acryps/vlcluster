# vlcluster
Simple docker-based cluster designed for multi-env web applications.

> vlcluster was written as a prototype and will be rewritten soon

## Commands
### Setup
```
vlcluster init [client] [-e | --email <email>] [-h | --hostname <registry hostname>] [-k | --key <registry key>]
vlcluster init registry [-n | --name <registry name>]
vlcluster init worker [-h | --hostname <registry hostname>] [-k | --key <registry key>] [-n | --name <worker name>]
vlcluster init endpoint [-c | --cluster <registry hostname>] [-h | --hostname <endpoint hostname>]
vlcluster init gateway [--cluster-hostname <cluster hostname>] [--cluster-key <cluster key>] [-n | --name <gateway name>] [--endpoint-hostname <endpoint hostname>]
```

### Building and Publishing
```
vlcluster build [[ -p | --project-path ] <project path> = "."]
vlcluster push [-c | --cluster <registry hostname>] [[ -a | --application ] <application>] [[ -v | --version ] <version>]
vlcluster upgrade [-c | --cluster <registry hostname>] [[ -a | --application ] <application>] [[ -v | --version ] <version>] [[ -e | --env ] <environnement>]

vlcluster deploy [-c | --cluster <registry hostname>] [[ -e | --env ] <environnement>] [[ -p | --project-path ] <project path> = "."]
```

### Variables
``````