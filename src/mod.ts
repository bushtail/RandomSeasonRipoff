import path from "node:path";
import type { DependencyContainer } from "tsyringe";
import type { IPostDBLoadMod } from "@spt/models/external/IPostDBLoadMod";
import type { VFS } from "@spt/utils/VFS";
import type { ConfigServer } from "@spt/servers/ConfigServer";
import { ConfigTypes } from "@spt/models/enums/ConfigTypes";
import { jsonc } from "jsonc";
import type { ILogger } from "@spt/models/spt/utils/ILogger";
import type { IWeatherConfig } from "@spt/models/spt/config/IWeatherConfig";
import type { IPostSptLoadMod } from "@spt/models/external/IPostSptLoadMod";
import type { Season } from "@spt/models/enums/Season";
import type { ISeasonalEventConfig } from "@spt/models/spt/config/ISeasonalEventConfig";
import type { IPreSptLoadMod } from "@spt/models/external/IPreSptLoadMod";

class Mod implements IPostDBLoadMod,IPostSptLoadMod,IPreSptLoadMod
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

    private getRandomSeason(weights: number[]): number 
    {
        const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
        const random = Math.random() * totalWeight;
        let cumulativeWeight = 0;

        for (let i = 0; i < weights.length; i++) {
            cumulativeWeight += weights[i];
            if(random < cumulativeWeight) {
                return i;
            }
        }
        throw new Error("Failed to select a season based on weightings.")
    }

    public preSptLoad(container: DependencyContainer): void 
    {
        const vfs = container.resolve<VFS>("VFS");
        const modConfigJsonC = jsonc.parse(vfs.readFile(path.resolve(__dirname, "../config/config.jsonc")));
        const configServer = container.resolve<ConfigServer>("ConfigServer");
        const weatherConfig : IWeatherConfig = configServer.getConfig(ConfigTypes.WEATHER);
        const seasonalEventConfig: ISeasonalEventConfig = configServer.getConfig(ConfigTypes.SEASONAL_EVENT)       
    }

    public postDBLoad(container: DependencyContainer): void 
    {
        // code graciously provided by AcidPhantasm
        const vfs = container.resolve<VFS>("VFS");
        const modConfigJsonC = jsonc.parse(vfs.readFile(path.resolve(__dirname, "../config/config.jsonc")));
        const configServer = container.resolve<ConfigServer>("ConfigServer");
        const weatherConfig : IWeatherConfig = configServer.getConfig(ConfigTypes.WEATHER);
        const logger = container.resolve<ILogger>("WinstonLogger");
       
        weatherConfig.overrideSeason = null // preinitialises the season to null just in case the user edited their weather.json

        const seasonWeights: number[] = [
            modConfigJsonC.Summer,
            modConfigJsonC.Autumn,
            modConfigJsonC.Winter,
            modConfigJsonC.Spring,
            modConfigJsonC.LateAutumn,
            modConfigJsonC.EarlySpring,
            modConfigJsonC.Storm
        ];

        if (seasonWeights.some(weight => typeof weight !== "number" || weight < 0)) {
            logger.error(`${this.modName} Invalid season weights in config. All weights must be non-negative numbers. Defaulting to Auto.`);
            return;
        }

        const selectedSeason = this.getRandomSeason(seasonWeights);

        weatherConfig.overrideSeason = selectedSeason;
        logger.success(`${this.modName} Randomly Selected Season: ${this.seasonsArray[selectedSeason]}`);
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
