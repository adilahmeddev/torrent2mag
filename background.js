// Use browser namespace for compatibility with Firefox
const api = typeof browser !== "undefined" ? browser : chrome;

api.runtime.onInstalled.addListener(() => {
  console.log("Extension installed. Creating context menu...");
  api.contextMenus.create({
    id: "generateMagnetLink",
    title: "Generate Magnet Link",
    contexts: ["link"],
    targetUrlPatterns: ["*://*/*.torrent"]
  });
});

api.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "generateMagnetLink") {
    try {
      const response = await fetch(info.linkUrl);
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const buffer = await response.arrayBuffer();
      const torrentData = new Uint8Array(buffer);

      // Decode the torrent file
      const torrent = bdecode(torrentData);
      console.log("Decoded torrent:", torrent);

      // Get the info dictionary and compute its hash
      if (!torrent.hasOwnProperty('info')) {
        throw new Error("No info dictionary found in torrent");
      }

      const bencodedInfo = bencode(torrent.info);
      const infoHash = await sha1(bencodedInfo);
      console.log("Info hash:", infoHash);

      // Extract trackers
      const trackers = new Set();
      if (torrent.announce) {
        trackers.add(decodeBytes(torrent.announce));
      }
      if (torrent['announce-list']) {
        torrent['announce-list'].forEach(group => {
          group.forEach(tracker => trackers.add(decodeBytes(tracker)));
        });
      }

      // Generate magnet link
      let magnetLink = `magnet:?xt=urn:btih:${infoHash}`;
      if (torrent.info.name) {
        magnetLink += `&dn=${encodeURIComponent(decodeBytes(torrent.info.name))}`;
      }
      trackers.forEach(tracker => {
        magnetLink += `&tr=${encodeURIComponent(tracker)}`;
      });

      console.log("Generated magnet link:", magnetLink);

      // Copy to clipboard
      await api.scripting.executeScript({
        target: { tabId: tab.id },
        func: copyToClipboard,
        args: [magnetLink]
      });

      api.notifications.create({
        type: "basic",
        iconUrl: "icon48.png",
        title: "Magnet Link Generated",
        message: "Magnet link copied to clipboard"
      });

    } catch (error) {
      console.error("Error:", error);
      api.notifications.create({
        type: "basic",
        iconUrl: "icon48.png",
        title: "Error",
        message: error.message
      });
    }
  }
});

function decodeBytes(bytes) {
  return new TextDecoder().decode(bytes);
}

function bdecode(data) {
  let index = 0;

  function readUntil(delimiter) {
    const start = index;
    while (index < data.length && data[index] !== delimiter) {
      index++;
    }
    return data.slice(start, index);
  }

  function decode() {
    if (index >= data.length) throw new Error("Unexpected end of data");

    const char = data[index];
    if (char === 105) { // 'i'
      index++;
      const numData = readUntil(101); // 'e'
      index++; // skip 'e'
      return parseInt(new TextDecoder().decode(numData));
    }
    else if (char === 108) { // 'l'
      index++;
      const list = [];
      while (index < data.length && data[index] !== 101) { // 'e'
        list.push(decode());
      }
      index++; // skip 'e'
      return list;
    }
    else if (char === 100) { // 'd'
      index++;
      const dict = {};
      while (index < data.length && data[index] !== 101) { // 'e'
        const key = decode();
        const value = decode();
        dict[typeof key === 'string' ? key : decodeBytes(key)] = value;
      }
      index++; // skip 'e'
      return dict;
    }
    else if (char >= 48 && char <= 57) { // '0-9'
      const lenData = readUntil(58); // ':'
      index++; // skip ':'
      const len = parseInt(new TextDecoder().decode(lenData));
      const value = data.slice(index, index + len);
      index += len;
      return value;
    }
    throw new Error(`Invalid bencoding char: ${char}`);
  }

  return decode();
}

function bencode(data) {
  const encoder = new TextEncoder();

  if (typeof data === "number") {
    return encoder.encode(`i${data}e`);
  }

  if (data instanceof Uint8Array) {
    const lenPrefix = encoder.encode(`${data.length}:`);
    return concat(lenPrefix, data);
  }

  if (typeof data === "string") {
    const strBytes = encoder.encode(data);
    const lenPrefix = encoder.encode(`${strBytes.length}:`);
    return concat(lenPrefix, strBytes);
  }

  if (Array.isArray(data)) {
    const parts = [encoder.encode('l')];
    for (const item of data) {
      parts.push(bencode(item));
    }
    parts.push(encoder.encode('e'));
    return concat(...parts);
  }

  if (data && typeof data === "object") {
    const parts = [encoder.encode('d')];
    const keys = Object.keys(data).sort();
    for (const key of keys) {
      parts.push(bencode(key));
      parts.push(bencode(data[key]));
    }
    parts.push(encoder.encode('e'));
    return concat(...parts);
  }

  throw new Error(`Unsupported type: ${typeof data}`);
}

function concat(...arrays) {
  const totalLength = arrays.reduce((acc, arr) => acc + arr.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}

async function sha1(data) {
  const hashBuffer = await crypto.subtle.digest("SHA-1", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

function copyToClipboard(text) {
  navigator.clipboard.writeText(text).then(() => {
    console.log("Copied to clipboard:", text);
  }).catch(err => {
    console.error("Failed to copy:", err);
  });
}

