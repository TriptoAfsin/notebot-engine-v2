import express, { Express, Request, Response , Application } from 'express';
import dotenv from 'dotenv';
import { getErrorMessage } from 'constants/errors';

//For env File 
dotenv.config();

const app: Application = express();
const port = process.env.PORT || 8000;

app.get('/', (req: Request, res: Response) => {
  res.status(200).json({message: 'Welcome to Express & TypeScript Server'})
});

app.get('/error', (req: Request, res: Response) => {
  res.status(400).json({message: getErrorMessage[400]})
});

app.listen(port, () => {
  console.log(`listening at http://localhost:${port}`);
});