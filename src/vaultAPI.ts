import { VaultClient, TokenizeRequest,Collection } from '@piiano/vault-client';
import { config } from "./config";

import { PiiEntityType } from "@aws-sdk/client-comprehend";

export interface PiiEntity {
    /**
     * <p>The level of confidence that Amazon Comprehend has in the accuracy of the
     *       detection.</p>
     * @public
     */
    score?: number | undefined;
    /**
     * <p>The entity's type.</p>
     * @public
     */
    type?: PiiEntityType | undefined;
    /**
     * <p>The zero-based offset from the beginning of the source text to the first character in the
     *       entity.</p>
     * @public
     */
    beginOffset?: number | undefined;
    /**
     * <p>The zero-based offset from the beginning of the source text to the last character in the
     *       entity.</p>
     * @public
     */
    endOffset?: number | undefined;
}

export interface StringDictionary {
    [key: string]: string;
}

const client = new VaultClient({
    vaultURL: config.vaultUrl,
    apiKey: config.vaultApiKey
});

export class VaultAPI {
    //Placeholder for vault APIs we need
    private tokens: StringDictionary = {};
    private collection:Collection|undefined;
    constructor() {
       
    }

    public async init() {
        await  this.createCollection(config.logCollection);
    }

    private  async createCollection(collectionName: string): Promise<void> {
        if (this.collection) return;
        let collections = await client.collections.listCollections();
        const filtered = collections.filter(collection => collection.name === collectionName)
        if (!filtered?.length) {
            this.collection = await client.collections.addCollection({
                requestBody: {
                    "type": "DATA",
                    "name": collectionName,
                    "properties": [

                        {
                            "description": "a log Field",
                            "name": config.logField,
                            "data_type_name": "STRING",
                            "is_unique": true,
                            "is_index": true,
                            "is_substring_index": false,
                            "is_nullable": true
                        }
                    ]
                }
            });
        } else {
            this.collection = filtered[0];
        }

    }

    public async tokenize(values: Array<string>): Promise<StringDictionary> {
        const s = "a";
        const b = { [config.logField]: s };

        const objectEntries = values.map(value => {
            const req: TokenizeRequest = {
                "type": "deterministic",
                "object": {
                    "fields": { [config.logField]: value }
                },
                "props": [
                    config.logField
                ]
            };
            return req
        });
     
        const tokens = await client.tokens.tokenize({ collection: config.logCollection, reason: "AppFunctionality", requestBody: objectEntries }).catch(err => {
            console.log("error for request: ",objectEntries )
        })
        const entitiesWithTokens = values.map((value, index) => {
            return   tokens?.[index]? { [value]: tokens[index].token_id }:{}

        });
        return Object.assign({}, ...entitiesWithTokens);


    }

    public async getPiiEntities(texts: string[]): Promise<PiiEntity[][]> {
        const url = config.lambdaEndpoint;
        const data = { "method": "detect", "language": "en", "textList": texts }
        const reponse = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                // Add other headers as needed
                // 'Authorization': 'Bearer your-token'
            },
            body: JSON.stringify(data)
        });

        const jsonRespone = await reponse.json();
        return jsonRespone.detections.map((detection: { entities: any; }) => detection.entities);
    }


}
