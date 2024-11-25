import dotenv from 'dotenv';
dotenv.config();

interface ServerConfig {
  port: number;
  environment: string;
}
interface ServerConfig {
  port: number;
  environment: string;
}

interface AppConfig {
  piiFields: string[];
  noPiiFields: string[];
  server: ServerConfig;
  vaultApiKey: string;
  vaultUrl: string;
  lambdaEndpoint: string;
  transformedFilesLocation: string;
  logCollection:string;
  logField:string;
  
}


export const config: AppConfig = {
  piiFields: JSON.parse(process.env.PII_FIELDS || '[]'),
  noPiiFields: JSON.parse(process.env.NON_PII_FIELDS || '[]'),
  server: {
    port: process.env.PORT ? parseInt(process.env.PORT, 10) : 3000,
    environment: process.env.NODE_ENV || 'development'
  },
  vaultApiKey: process.env.VAULT_API_KEY || '',
  vaultUrl: process.env.VAULT_URL || '',
  lambdaEndpoint: process.env.LAMBDA_ENDPOINT || '',
  transformedFilesLocation: process.env.TRANSFORMED_FILES_LOCATION || '',
  logCollection: process.env.LOG_COLLECTION || '',
  logField: process.env.LOG_FIELD || ''
};

export type { AppConfig };
