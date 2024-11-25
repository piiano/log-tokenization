import { PiiEntity, StringDictionary, VaultAPI } from "./vaultAPI";
import { config } from "./config";

export interface Event {
    [key: string]: any;

}


interface ProcessedEvent {
    knownFields: Event;
    eventToAnalyze: Event;
    piiEntities: PiiEntity[];
    eventRequest: EventRequest;
}


interface TextLocation {
    path: string[];
    text: string;
    startIndex: number;
    length: number;
}

interface EventRequest {
    eventText: string;
    textLocations: TextLocation[];
}


const DELIMITER = " @@--@@ ";

export class EventsProcessor {
    private readonly events: Event[] = [];

    private readonly eventsToTokenize: Event[] = [];

    private vaultAPI: VaultAPI;

    constructor(events: Event[], vaultAPI: VaultAPI) {
        this.events = events;;
        this.vaultAPI = vaultAPI
    }

    private preprocessEvent(): ProcessedEvent[] {
        //Split the Event to known fields from config and fields To Anlayze
        return this.events.map((event) => {
            const fieldsToAnalyze: Event = {};

            for (const key in event) {
                if (!config.piiFields.includes(key) && !config.noPiiFields.includes(key)) {
                    fieldsToAnalyze[key] = event[key];
                }
            }
            if (Object.keys(fieldsToAnalyze).length == 0) {
                return { knownFields: event, eventToAnalyze: {}, piiEntities: [], eventRequest: { eventText: "", textLocations: [] } };
            } else {
                return { knownFields: event, eventToAnalyze: fieldsToAnalyze, piiEntities: [], eventRequest: { eventText: "", textLocations: [] } };

            }
        });
    }

    private async detectPii(splittedEvents: ProcessedEvent[]): Promise<ProcessedEvent[]> {
        const eventRequests = splittedEvents.flatMap((eventSplit) => {
            if (Object.keys(eventSplit.eventToAnalyze).length > 0) {
                let [concatenatedText, textLocations] = this.collectStringValues(eventSplit.eventToAnalyze, [], [], "");
                return [{ eventText: concatenatedText, textLocations: textLocations }];
            }
            else return [];
        });

        const piiEntitiesOfEvents = await this.vaultAPI.getPiiEntities(eventRequests.map((eventRequest) => eventRequest.eventText));
        let piiEntitiyIndex = 0;
        splittedEvents.forEach((eventSplit, index) => {
            if (Object.keys(eventSplit.eventToAnalyze).length > 0) {
                if (!piiEntitiesOfEvents[piiEntitiyIndex]) {
                      console.log("here");
                }
                eventSplit.piiEntities = piiEntitiesOfEvents[piiEntitiyIndex];
                eventSplit.eventRequest = eventRequests[piiEntitiyIndex];
                piiEntitiyIndex++;
            }
        });
        return splittedEvents;
    }

    public async processEvents(): Promise<Event[]> {
        // 1. Split to events that are known from config and stuff we need to analyze
        const splittedEvents = this.preprocessEvent();
        // 2. Call detection API to fill the event with PII entities
        const eventsWithPii = await this.detectPii(splittedEvents);
        // 3. Call tokenization API to get tokens to replace
        const tokens = await this.tokenizeEntities(eventsWithPii);
        // 4. Actually Create the transformed events
        return this.replaceTokens(eventsWithPii, tokens);
    }

    private collectStringValues(
        obj: any,
        currentPath: string[],
        locations: TextLocation[],
        concatenatedText: string
    ): [string, TextLocation[]] {
        if (!obj || typeof obj !== 'object') {
            return [concatenatedText, locations];
        }
        for (const [key, value] of Object.entries(obj)) {
            const newPath = [...currentPath, key];

            if (typeof value === 'string') {
                locations.push({
                    path: newPath,
                    text: value,
                    startIndex: concatenatedText.length,
                    length: value.length
                });
                concatenatedText += value + DELIMITER;
            } else if (typeof value === 'object' && value !== null) {
                [concatenatedText, locations] = this.collectStringValues(value, newPath, locations, concatenatedText);
            }
        }
        return [concatenatedText, locations];
    }

    private setValueAtPath(obj: any, path: string[], value: any): void {
        let current = obj;
        for (let i = 0; i < path.length - 1; i++) {
            current = current[path[i]];
        }
        current[path[path.length - 1]] = value;
    }


    public replaceEntitiesInEvent(event: ProcessedEvent, tokens: StringDictionary): Event {
        const sortedEntities = [...event.piiEntities].sort((a, b) =>
            (b.beginOffset || 0) - (a.beginOffset || 0)
        );
        let maskedText = event.eventRequest.eventText;
        for (const entity of sortedEntities) {
            if (entity.beginOffset !== undefined && entity.endOffset !== undefined) {
                const maskLabel = tokens[maskedText.substring(entity.beginOffset, entity.endOffset )];

                maskedText =
                    maskedText.substring(0, entity.beginOffset) +
                    maskLabel +
                    maskedText.substring(entity.endOffset);
            }
        }

        const maskedParts = maskedText.split(DELIMITER);
        const maskedJson = { ...event.eventToAnalyze };
        event.eventRequest.textLocations.forEach((location, index) => {
            this.setValueAtPath(maskedJson, location.path, maskedParts[index]);
        });
        return maskedJson;
    }

    private async tokenizeEntities(processedEvents: ProcessedEvent[]): Promise<StringDictionary> {
        // Collect things to tokenize 

        const rawLogFields = processedEvents.flatMap((event => {

            const piiValues: string[] = [];
            for (const key in event.knownFields) {
                if (config.piiFields.includes(key)) {
                    piiValues.push(event.knownFields[key]);
                }
            }
            return piiValues;
        }));

        const piiEntitieFields = processedEvents.flatMap((event, index) => {
            const piiValues: string[] = event.piiEntities.flatMap((entity) => {
                if (entity.beginOffset !== undefined && entity.endOffset !== undefined) {
                    return [event.eventRequest.eventText.substring(entity.beginOffset, entity.endOffset )];
                } else {
                    return [];
                }
            });
            return piiValues;
        });
        const allValues = new Set<string>([...rawLogFields, ...piiEntitieFields]);
        return await this.vaultAPI.tokenize([...allValues]);

    }

    public replaceTokens(events: ProcessedEvent[], tokens: StringDictionary): Event[] {
        return events.map((event, index) => {
            const maskConfigFields: Event = {};
            for (const key in event.knownFields) {
                maskConfigFields[key] = config.piiFields.includes(key) ?
                    tokens[event.knownFields[key]] :
                    event.knownFields[key];

            }

            const maskDetectedEntities = this.replaceEntitiesInEvent(event, tokens);
            const transformedEvent = { ...maskConfigFields, ...maskDetectedEntities };
            return transformedEvent;
        })

    }


}