# HangO

Simple Node.js + Express + MySQL app with signup/login and a basic landing page.

## Setup

1. Install Node.js (LTS)
2. Install dependencies
3. Create database and configure env
4. Run the server

### 1) Install dependencies

```powershell
npm install
```

### 2) Configure environment

Copy `.env.example` to `.env` and set your MySQL credentials.

Create a database (default name `hango`):

```sql
CREATE DATABASE IF NOT EXISTS hango;
```

### 3) Run

```powershell
npm run start
```

Server: http://localhost:3000

Check DB health: GET /health

Tables are auto-created on start when DB is enabled. In the current no-DB demo mode, auth uses an in-memory store and resets on server restart.

## Switching databases (off GCP)

You can use any MySQL-compatible database. Three easy options:

1) Local MySQL (XAMPP/WAMP/Homebrew)
- Install MySQL locally and create a DB `hango`.
- Copy `.env.example` to `.env` and set:
	- DB_HOST=127.0.0.1
	- DB_PORT=3306
	- DB_USER=root
	- DB_PASSWORD= (your local password)
	- DB_NAME=hango

2) Docker MySQL
```powershell
docker run --name hango-mysql -e MYSQL_ROOT_PASSWORD=pass -e MYSQL_DATABASE=hango -p 3306:3306 -d mysql:8
```
Then set in `.env`:
```
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=pass
DB_NAME=hango
```

3) PlanetScale (serverless MySQL)
- Create a database and get the connection string.
- Set `.env`:
```
DB_HOST=<host>
DB_PORT=3306
DB_USER=<username>
DB_PASSWORD=<password>
DB_NAME=<db>
DB_SSL=true
```

Restart the server after changing `.env`.
