import path from "node:path";
import type { DependencyContainer } from "tsyringe";
import type { IPostDBLoadMod } from "@spt/models/external/IPostDBLoadMod";
import type { VFS } from "@spt/utils/VFS";
import type { ConfigServer } from "@spt/servers/ConfigServer";
import { ConfigTypes } from "@spt/models/enums/ConfigTypes";
import { jsonc } from "jsonc";
import type { ILogger } from "@spt/models/spt/utils/ILogger";
import type { IWeatherConfig } from "@spt/models/spt/config/IWeatherConfig";
import type { Season } from "@spt/models/enums/Season";
import type { IPreSptLoadMod } from "@spt/models/external/IPreSptLoadMod";
import { StaticRouterModService } from "@spt/services/mod/staticRouter/StaticRouterModService";
import { WeatherCallbacks } from "@spt/callbacks/WeatherCallbacks";

class Mod implements IPostDBLoadMod,IPreSptLoadMod,IPostDBLoadMod
{

    private modName = "[Random Season Ripoff]"
    
    private seasonsArray = ["Summer","Autumn","Winter","Spring","Late Autumn","Early Spring","Storm"] // seasons array
    /*
    SUMMER = 0,
    AUTUMN = 1,
    WINTER = 2,
    SPRING = 3,
    AUTUMN_LATE = 4,
    SPRING_EARLY = 5,
    STORM = 6
    */

    private finalSelectedSeason: Season

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

    public postDBLoad(container: DependencyContainer): void 
    {
        // code graciously provided by AcidPhantasm
        const configServer = container.resolve<ConfigServer>("ConfigServer");

        const weatherConfig : IWeatherConfig = configServer.getConfig(ConfigTypes.WEATHER);
        const logger = container.resolve<ILogger>("WinstonLogger");
       
        weatherConfig.overrideSeason = null // Pre-initialises the season to null just in case the user edited their weather.json

        const season = this.getRandomSeason(container)

        weatherConfig.overrideSeason = season;
        logger.success(`${this.modName} Randomly Selected Season: ${this.seasonsArray[season]}`);
        this.finalSelectedSeason = weatherConfig.overrideSeason;
    }

    public postSptLoad(container: DependencyContainer): void 
    {
        const configServer = container.resolve<ConfigServer>("ConfigServer");
        const weatherConfig : IWeatherConfig = configServer.getConfig(ConfigTypes.WEATHER);
        const logger = container.resolve<ILogger>("WinstonLogger");

        if (this.finalSelectedSeason !== weatherConfig.overrideSeason) // if another mod changed the value that we all agreed on
        {
            if (weatherConfig.overrideSeason === null) // if another mod set the value to null
            { 
                logger.warning(`${this.modName} Another mod has overridden the selected season. Current season: Auto. Check your load order.`) 
            } 
            else if (weatherConfig.overrideSeason < 7) // if another mod set the value to a different season
            {
                logger.warning(`${this.modName} Another mod has overridden the selected season. Current season: ${this.seasonsArray[weatherConfig.overrideSeason]}. Check your load order.`) 
            }
            else // another mod set the value to something that doesn't make sense
            {
                logger.warning(`${this.modName} Another mod has overridden the selected season to an invalid value: ${weatherConfig.overrideSeason}. Check your load order.`) 
            } // granted, it will not be able to detect if another mod set the value to the same one that SSS did, but there's only so much we can do
        }
    }
}

export const mod = new Mod();
