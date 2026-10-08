# Capacitação AWS · CCE

Uma API NestJS que serve uma página única com 3 cartões que "acendem" conforme você configura os serviços da AWS durante a aula:

1. **Servidor (EC2)**: sempre aceso, mostra os dados da instância.
2. **Banco (RDS Postgres)**: apagado até existir `DATABASE_URL` no `.env`.
3. **Arquivos (S3)**: apagado até existir `S3_BUCKET` no `.env`.

A app nunca quebra por falta (ou falha) de banco/bucket: as rotas do módulo não configurado respondem `503` e o erro aparece em `/api/status`.

```
navegador ──► Nginx :80 ──► Nest :3000 ──► RDS Postgres (:5432)
                                       └─► S3 (via instance profile)
```

## 1. Pré-requisitos na AWS (console)

### 1.1 Role da EC2
IAM → Roles → Create role → *AWS service* → *EC2*.
- Anexe a policy gerenciada **AmazonSSMManagedInstanceCore** (para usar o Session Manager).
- Nome: **`capacitacao-ec2-role`**. Depois de criada: *Add permissions* → *Create inline policy* → aba JSON → cole o conteúdo de [`deploy/iam-policy.json`](deploy/iam-policy.json) → nome `capacitacao-s3`.

### 1.2 Security groups (EC2 → Security Groups)
- **`sg-api`**: entrada TCP **80** e **443** de `0.0.0.0/0`.
- **`sg-banco`**: entrada TCP **5432** com origem **`sg-api`** (o security group, não um IP).

### 1.3 RDS
RDS → Create database → **PostgreSQL**, classe **db.t4g.micro**, usuário `postgres` e uma senha anotada.
- *Public access*: **No**.
- *VPC security group*: **`sg-banco`**.
- Anote o *endpoint* quando ficar disponível.

### 1.4 EC2
EC2 → Launch instance:
- AMI **Ubuntu Server 24.04 LTS**, tipo **t3.small**.
- Key pair: **Proceed without a key pair** (acesso via Session Manager).
- Security group: **`sg-api`**.
- *Advanced details* → IAM instance profile: **`capacitacao-ec2-role`**.

Quando estiver *running*, conecte em *Connect* → **Session Manager**.

## 2. Receita na EC2

### 2.1 Pacotes
```bash
sudo -i
export NEEDRESTART_MODE=a
apt update
apt install -y nginx git
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt install -y nodejs
npm i -g pm2
```

### 2.2 (Opcional, t3.micro) Swap de 1 GB
```bash
fallocate -l 1G /swapfile
chmod 600 /swapfile
mkswap /swapfile
swapon /swapfile
```

### 2.3 App
```bash
cd /opt
git clone <https://github.com/cce-fluxo/capacitacao-aws> app
cd app
npm ci
npm run build
nano .env
```
No `.env` (veja `.env.example`) coloque só:
```
AWS_REGION=us-east-1
PORT=3000
```
Suba com o PM2 e confirme:
```bash
pm2 start dist/main.js --name app
pm2 save
pm2 startup        # execute o comando que ele imprimir
curl localhost:3000/api/health
```
Deve responder `{"status":"ok"}`.

> Sempre inicie a app a partir de `/opt/app`: é de lá que o `.env` é lido.

### 2.4 Nginx
```bash
truncate -s 0 /etc/nginx/sites-available/default
nano /etc/nginx/sites-available/default
```
Cole o conteúdo de [`deploy/nginx.conf`](deploy/nginx.conf):
```nginx
server {
    listen 80 default_server;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```
```bash
nginx -t && systemctl reload nginx
```
Abra `http://IP-PUBLICO-DA-EC2` no navegador: o cartão do servidor está aceso, os outros dois apagados.

### 2.5 Banco
Edite o `.env` e adicione (troque `SENHA` e `ENDPOINT`):
```
DATABASE_URL=postgresql://postgres:SENHA@ENDPOINT:5432/postgres
```
```bash
cd /opt/app
pm2 restart app
pm2 logs app --lines 15
```
Procure por `Banco conectado`. O cartão do banco acende. (Não use `sslmode` na URL: o SSL já é ligado no código.)

Opcional, para ver a tabela:
```bash
apt install -y postgresql-client
psql "postgresql://postgres:SENHA@ENDPOINT:5432/postgres?sslmode=require" -c "select * from notes;"
```

### 2.6 S3
1. S3 → Create bucket com nome começando por **`capacitacao-aws-`** (ex.: `capacitacao-aws-seunome`), mesma região da EC2, *Block all public access* ligado.
2. No bucket: *Permissions* → *Cross-origin resource sharing (CORS)* → *Edit* → cole [`deploy/cors.json`](deploy/cors.json):
   ```json
   [{"AllowedHeaders":["*"],"AllowedMethods":["GET","PUT"],"AllowedOrigins":["*"],"ExposeHeaders":["ETag"],"MaxAgeSeconds":3000}]
   ```
3. Na EC2, adicione ao `.env`:
   ```
   S3_BUCKET=capacitacao-aws-seunome
   ```
   ```bash
   cd /opt/app
   pm2 restart app
   pm2 logs app --lines 15
   ```
   Procure por `S3 configurado: capacitacao-aws-seunome`. O cartão de arquivos acende.

## 3. Limpeza (nesta ordem)
1. **EC2**: *Terminate instance*.
2. **S3**: esvazie o bucket (*Empty*) e depois *Delete*.
3. **RDS**: *Delete* (desmarque o snapshot final e confirme).

## 4. Troubleshooting

| Sintoma | Causa / solução |
|---|---|
| **502 Bad Gateway** no navegador | A API está fora do ar. `pm2 status`, `pm2 logs app`, `curl localhost:3000/api/health`. |
| Banco: **timeout** (`Connection terminated due to connection timeout`) | Security group. `sg-banco` precisa liberar 5432 com origem `sg-api`, e o RDS tem que estar no `sg-banco`. |
| Banco: **password authentication failed** | Senha errada na `DATABASE_URL` (caracteres especiais precisam de URL-encode). |
| Upload falha com **erro de CORS** no console do navegador | CORS do bucket não foi colado/salvo (`deploy/cors.json`). |
| Upload dá **403** / S3 mostra erro de acesso | O nome do bucket não começa com `capacitacao-aws-`, ou a inline policy não está na role. |
| **`Killed`** no `npm ci` | Falta de memória. Crie o swap (passo 2.2) e rode de novo. |
| **Session Manager indisponível** | A role `capacitacao-ec2-role` não está na instância (*Actions → Security → Modify IAM role*) ou o agente ainda não registrou: aguarde 2-3 min ou reinicie a instância. |

## Teste local (opcional)
```bash
docker compose up -d
cp .env.example .env     # descomente DATABASE_URL (postgres:postgres@localhost) e DB_SSL=false
npm ci && npm run build && npm start
```
