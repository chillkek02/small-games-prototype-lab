module.exports = {
  packagerConfig: {
    asar: false,
    executableName: 'Gutpopper Game Factory'
  },
  rebuildConfig: {},
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      config: {
        name: 'GutpopperGameFactory',
        setupExe: 'Gutpopper-Game-Factory-Setup.exe'
      }
    },
    {
      name: '@electron-forge/maker-zip',
      platforms: ['win32']
    }
  ]
};
