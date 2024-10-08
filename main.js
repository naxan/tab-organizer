document.addEventListener('DOMContentLoaded', () => {
  // query the current window's tabs, and do things with the tabs
  chrome.tabs.query({ windowId: chrome.windows.WINDOW_ID_CURRENT }, (tabs) => {
    // delete one tab
    // chrome.tabs.remove is asynchronous but doesn't return a promise, so is hard to use reliably.
    // so I made it a Promise
    function deleteTab(tabId) {
      if (favorites[tabId]) return;
      return new Promise((resolve, reject) => {
        chrome.tabs.remove(tabId, () => {
          if (chrome.runtime.lastError) return reject(chrome.runtime.lastError);
          resolve();
        });
      });
    }

    // switch active tab to specific tab
    function switchTab(tabId) {
      chrome.tabs.update(tabId, { active: true });
    }

    // variables
    const tabListElement = document.getElementById('tab-list');
    let searchedTabs = [];
    let favorites = {};
    function getFavorites() {
      return new Promise((resolve, reject) => {
        chrome.storage.local.get({ favorites: {} }, (result) => {
          if (chrome.runtime.lastError) {
            console.error(
              'Error reading from storage:',
              chrome.runtime.lastError
            );
          } else {
            favorites = result.favorites;
            console.log('Favorites loaded from storage:', result.favorites);
            resolve();
          }
        });
      });
    }

    // save favorites to local storage
    async function saveFavorites() {
      await chrome.storage.local.set({ favorites: favorites }, () => {
        if (chrome.runtime.lastError) {
          console.error('Error saving to storage:', chrome.runtime.lastError);
        } else {
          console.log('Favorites saved to storage:', favorites);
        }
      });
    }

    // Creating/maintaing tab list
    function addTabToList(tab) {
      // make list item
      const listItem = document.createElement('li');
      listItem.innerHTML = `${tab.title}`;

      // make container for switch and delete buttons
      const buttonContainer = document.createElement('div');
      buttonContainer.classList.add('button-container');

      // favorite
      const heartIcon = document.createElement('img');
      if (favorites[tab.id]) heartIcon.src = './heart-filled.png';
      else heartIcon.src = './heart.png';
      heartIcon.id = 'heart-icon';
      heartIcon.addEventListener('click', () => {
        // change heart icon on click
        if (heartIcon.src.includes('heart.png')) {
          heartIcon.src = './heart-filled.png';
          favorites[tab.id] = true;
        } else {
          heartIcon.src = './heart.png';
          delete favorites[tab.id];
        }
        saveFavorites();
        // add tab to favorite object. when pressing delete, check if tab exists in object. if so, don't delete (just return);
      });

      // make delete button
      const deleteButton = document.createElement('button');
      deleteButton.innerHTML = 'Delete Tab';
      deleteButton.addEventListener('click', async () => {
        await deleteTab(tab.id);

        clearList();
        chrome.tabs.query(
          { windowId: chrome.windows.WINDOW_ID_CURRENT },
          (tabs) => {
            addAllTabs(tabs);
          }
        );
      });
      deleteButton.classList.add('delete-tab');

      // make switch button
      const switchButton = document.createElement('button');
      switchButton.innerHTML = 'Switch to';
      switchButton.addEventListener('click', () => {
        switchTab(tab.id);
      });
      switchButton.classList.add('switch-tab');

      // append everything to the DOM
      listItem.appendChild(buttonContainer);
      buttonContainer.appendChild(switchButton);
      buttonContainer.appendChild(deleteButton);
      switchButton.insertAdjacentElement('beforebegin', heartIcon);
      tabListElement.appendChild(listItem);
    }

    function clearList() {
      tabListElement.innerHTML = '';
    }

    // add tab title to list, and add delete and switch buttons
    function addAllTabs(tabs) {
      for (let i = 0; i < tabs.length; i++) {
        addTabToList(tabs[i]);
      }
    }

    // Organize Tabs
    function organizeTabs() {
      tabs.sort((tab1, tab2) => {
        if (tab1.url < tab2.url) return -1;
        if (tab2.url < tab1.url) return 1;
        else return 0;
      });
      for (let i = 0; i < tabs.length; i++) {
        chrome.tabs.move(tabs[i].id, { index: i });
      }
      clearList();
      addAllTabs(tabs);
    }
    let organizeButton = document.getElementById('organize');
    organizeButton.addEventListener('click', organizeTabs);

    // Close All Tabs
    async function closeAll() {
      const favTabsInWindow = tabs.filter((tab) => favorites[tab.id]);
      if (favTabsInWindow.length === 0) chrome.tabs.create({});
      let promises = [];
      for (let i = 0; i < tabs.length; i++) {
        promises.push(deleteTab(tabs[i].id));
      }
      await Promise.all(promises);
      clearList();
      chrome.tabs.query(
        { windowId: chrome.windows.WINDOW_ID_CURRENT },
        (tabs) => {
          addAllTabs(tabs);
        }
      );
    }
    let closeAllButton = document.getElementById('close-all');
    closeAllButton.addEventListener('click', closeAll);

    // Delete Searched Tabs
    const deleteSearchButton = document.createElement('button');
    deleteSearchButton.innerHTML = 'Delete Searched Tabs';
    deleteSearchButton.id = 'delete-search';
    const searchContainer = document.getElementById('search-container');
    async function deleteSearchResults() {
      const deletedTabs = [];
      for (let i = 0; i < searchedTabs.length; i++) {
        deletedTabs.push(deleteTab(searchedTabs[i].id));
      }
      await Promise.all(deletedTabs);
      searchInput.value = '';
      clearList();
      chrome.tabs.query(
        { windowId: chrome.windows.WINDOW_ID_CURRENT },
        (tabs) => {
          addAllTabs(tabs);
        }
      );
    }
    deleteSearchButton.addEventListener('click', deleteSearchResults);

    // Search input
    function searchTabs(input) {
      domainSort = false;
      domainSortButton.innerHTML = 'Sort Tab List by Domain';

      clearList();
      searchedTabs = [];

      for (let i = 0; i < tabs.length; i++) {
        if (tabs[i].url.includes(input) || tabs[i].title.includes(input)) {
          addTabToList(tabs[i]);
          searchedTabs.push(tabs[i]);
        }
      }

      if (input.length > 0) {
        searchContainer.appendChild(deleteSearchButton);
      } else {
        searchContainer.removeChild(deleteSearchButton);
      }
    }
    const searchInput = document.getElementById('search');
    searchInput.addEventListener('input', (e) => {
      searchTabs(e.target.value);
    });

    // sort tabs by domain
    function getDomain(url) {
      const hostname = new URL(url).hostname;
      // if (hostname.startsWith('www.')) return hostname.slice(4);
      // else return hostname;
      return hostname.startsWith('www.') ? hostname.slice(4) : hostname;
    }

    function sortByDomain() {
      domainSort = true;
      domainSortButton.innerHTML = 'Sort Tab List in Window Order';
      clearList();

      const domains = [];
      const tabsByDomain = {};

      for (let i = 0; i < tabs.length; i++) {
        const hostname = getDomain(tabs[i].url);
        if (domains.includes(hostname)) tabsByDomain[hostname].push(tabs[i]);
        else {
          domains.push(hostname);
          tabsByDomain[hostname] = [tabs[i]];
        }
      }

      for (let domain in tabsByDomain) {
        let domainHeader = document.createElement('h4');
        domainHeader.innerHTML = domain;
        domainHeader.classList.add('domain-name');
        tabListElement.appendChild(domainHeader);
        addAllTabs(tabsByDomain[domain]);
      }
    }
    function swapDomainSort() {
      if (!domainSort) sortByDomain();
      else {
        domainSort = false;
        domainSortButton.innerHTML = 'Sort Tab List by Domain';
        clearList();
        addAllTabs(tabs);
      }
    }
    // create button to sort all by domain
    let domainSort = false;
    const domainSortButton = document.createElement('button');
    domainSortButton.id = 'domain-sort';
    domainSortButton.innerHTML = 'Sort Tab List by Domain';
    domainSortButton.addEventListener('click', swapDomainSort);
    document
      .getElementById('main-button-container')
      .insertAdjacentElement('afterend', domainSortButton);

    // if a tab is closed, remove it from the favorites list
    chrome.tabs.onRemoved.addListener((tabId) => {
      if (favorites[tabId]) {
        delete favorites[tabId];
        saveFavorites();
        console.log(favorites);
      }
    });

    // main function to run app
    async function runApp() {
      await getFavorites();
      addAllTabs(tabs);
    }

    runApp();
  });
});

// update list correctly after deleting all
