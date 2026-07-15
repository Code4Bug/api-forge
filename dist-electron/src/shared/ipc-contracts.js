export function getActiveLargeModel(preferences) {
    if (!preferences)
        return undefined;
    return preferences.largeModels?.find((item) => item.id === preferences.activeLargeModelId)
        ?? (preferences.largeModel?.enabled ? preferences.largeModel : undefined);
}
export function getActiveLightModel(preferences) {
    if (!preferences)
        return undefined;
    return preferences.lightModels?.find((item) => item.id === preferences.activeLightModelId)
        ?? (preferences.lightModel?.enabled ? preferences.lightModel : undefined);
}
