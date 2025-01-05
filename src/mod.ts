import path from "node:path";
import type { DependencyContainer } from "tsyringe";
import type { IPostDBLoadMod } from "@spt/models/external/IPostDBLoadMod";
import type { VFS } from "@spt/utils/VFS";
import type { ConfigServer } from "@spt/servers/ConfigServer";
import { ConfigTypes } from "@spt/models/enums/ConfigTypes";
import { jsonc } from "jsonc";
import type { ILogger } from "@spt/models/spt/utils/ILogger";
import type { IWeatherConfig } from "@spt/models/spt/config/IWeatherConfig";
import type { IPreSptLoadMod } from "@spt/models/external/IPreSptLoadMod";
import { StaticRouterModService } from "@spt/services/mod/staticRouter/StaticRouterModService";
import { WeatherCallbacks } from "@spt/callbacks/WeatherCallbacks";

class Mod implements IPostDBLoadMod,IPreSptLoadMod,IPostDBLoadMod
{


    public preSptLoad(container: DependencyContainer): void
    {
        const weatherCallbacks = container.resolve<WeatherCallbacks>("WeatherCallbacks");
        const router = container.resolve<StaticRouterModService>("StaticRouterModService");
        const logger = container.resolve<ILogger>("WinstonLogger");
        router.registerStaticRouter(
            "[RSR] /client/weather",
            [
                {
                    url: "/client/weather",
                    action: (url: string, info: any, sessionID: string): any => {
                        const sptConfigWeather: IWeatherConfig = container.resolve<ConfigServer>("ConfigServer").getConfig<IWeatherConfig>(ConfigTypes.WEATHER);
                        const season = this.getRandomSeason(container)
                        sptConfigWeather.overrideSeason = season
                        logger.success(`${this.modName} Randomly Selected Season: ${this.seasonsArray[season]}`)
                        return weatherCallbacks.getWeather(url, info, sessionID);
                    }
                }
            ],
            "[RSR] /client/weather",
        )
    }

    postDBLoad(container: DependencyContainer): void {
        // Don't fuck with the science team!
    }

    private modName = "[Random Season Ripoff]"
    
    private seasonsArray = [
        "Summer", // 0
        "Autumn", // 1
        "Winter", // 2
        "Spring", // 3
        "Late Autumn", // 4
        "Early Spring", // 5
        "Storm" // 6
    ] // seasons array

    private getRandomSeason(container: DependencyContainer): number 
    {
        const logger = container.resolve<ILogger>("WinstonLogger");
        // Resolve the Virtual File System (VFS) from the container to handle file operations.
        const vfs = container.resolve<VFS>("VFS");
        // Read and parse the JSONC configuration file located in the "config" directory.
        const modConfigJsonC = jsonc.parse(vfs.readFile(path.resolve(__dirname, "../config/config.jsonc")));

        // Extract the season weights from the parsed configuration file and store them in an array.
        const seasonWeights: number[] = [
            modConfigJsonC.Summer,
            modConfigJsonC.Autumn,
            modConfigJsonC.Winter,
            modConfigJsonC.Spring,
            modConfigJsonC.LateAutumn,
            modConfigJsonC.EarlySpring,
            modConfigJsonC.Storm
        ];

        // Check if any value in seasonWeights is not a number or is negative, and returns if so.
        if (seasonWeights.some(weight => typeof weight !== "number" || weight < 0)) {
            logger.error(`${this.modName} Invalid season weights in config. All weights must be non-negative numbers.`);
            return;
        }
        // Calculate total of all season weights by summing up values in seasonWeights
        const totalWeight = seasonWeights.reduce((sum, weight) => sum + weight, 0);

        // Generate a random number between 0 and the total weight to select a season based on the weights.
        const random = Math.random() * totalWeight;
        
        // Iterate through the seasonWeights array, keeping a running total (cumulativeWeight).
        let cumulativeWeight = 0;
        for (let i = 0; i < seasonWeights.length; i++) {
            cumulativeWeight += seasonWeights[i];
            if(random < cumulativeWeight) {
                // Return the index of the first season where the random number is less than the cumulative weight.
                return i;
            }
        }
        throw new Error("Failed to select a season based on weightings.")
    }
}

export const mod = new Mod();
