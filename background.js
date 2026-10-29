// Al pulsar el icono, abre el Kit en una pestaña nueva recordando la pestaña de origen.
chrome.action.onClicked.addListener((tab) => {
  chrome.tabs.create({ url: chrome.runtime.getURL("index.html?tab=" + tab.id) });
});
