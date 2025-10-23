export const store = {
  // auth + tabs
  isAuthed: false,
  authUnknown: true,
  currentTab: 'simple',

  // user menu
  userState: { user: null, profile: null, unread: 0 },

  // server banner + SSE
  selectedGuild: null,
  gpuStream: null,
  triedAltSse: false,
};
