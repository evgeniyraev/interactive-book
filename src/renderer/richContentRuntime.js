(function initializeRichContentRuntime() {
  const ALLOWED_TAGS = new Set([
    'A',
    'BLOCKQUOTE',
    'BR',
    'EM',
    'FIGURE',
    'H1',
    'H2',
    'H3',
    'HR',
    'IMG',
    'LI',
    'OL',
    'P',
    'SPAN',
    'STRONG',
    'U',
    'UL'
  ]);

  const VOID_TAGS = new Set(['BR', 'HR', 'IMG']);
  const CLASS_ALLOWLIST = /^(ql-align-(center|right|justify)|ql-size-(small|large|huge)|rich-image|rich-page-break)$/;

  function isOverflow(element) {
    return element.scrollHeight - element.clientHeight > 0.5;
  }

  function normalizeSplitIndex(text, index) {
    if (index >= text.length) {
      return text.length;
    }

    const candidate = text.lastIndexOf(' ', index);
    if (candidate > index - 18) {
      return candidate + 1;
    }

    return index;
  }

  function cloneNodeInto(node, targetDocument) {
    return targetDocument.importNode(node, true);
  }

  function copyAllowedClasses(source, target) {
    const classNames = Array.from(source.classList || []).filter((className) => CLASS_ALLOWLIST.test(className));
    if (classNames.length > 0) {
      target.className = classNames.join(' ');
    }
  }

  function copyAllowedStyles(source, target) {
    const style = source.getAttribute('style');
    if (!style) {
      return;
    }

    const nextStyles = [];
    style.split(';').forEach((part) => {
      const [rawName, rawValue] = part.split(':');
      const name = String(rawName || '').trim().toLowerCase();
      const value = String(rawValue || '').trim();
      if (!value) {
        return;
      }

      if (name === 'color' || name === 'background-color') {
        nextStyles.push(`${name}: ${value}`);
      }
    });

    if (nextStyles.length > 0) {
      target.setAttribute('style', nextStyles.join('; '));
    }
  }

  async function sanitizeNode(node, targetDocument, resolveAssetUrl) {
    if (node.nodeType === Node.TEXT_NODE) {
      return targetDocument.createTextNode(node.textContent || '');
    }

    if (node.nodeType !== Node.ELEMENT_NODE) {
      return null;
    }

    const tagName = node.tagName.toUpperCase();
    if (!ALLOWED_TAGS.has(tagName)) {
      const fragment = targetDocument.createDocumentFragment();
      for (const child of Array.from(node.childNodes)) {
        const sanitizedChild = await sanitizeNode(child, targetDocument, resolveAssetUrl);
        if (sanitizedChild) {
          fragment.appendChild(sanitizedChild);
        }
      }

      return fragment;
    }

    const clean = targetDocument.createElement(tagName.toLowerCase());
    copyAllowedClasses(node, clean);
    copyAllowedStyles(node, clean);

    if (tagName === 'A') {
      const href = String(node.getAttribute('href') || '').trim();
      if (/^(https?:|mailto:|#)/i.test(href)) {
        clean.setAttribute('href', href);
        clean.setAttribute('target', '_blank');
        clean.setAttribute('rel', 'noreferrer noopener');
      }
    }

    if (tagName === 'FIGURE') {
      clean.classList.add('rich-image');
      clean.dataset.layout = node.getAttribute('data-layout') || 'full';
      clean.dataset.width = node.getAttribute('data-width') || '100';
      clean.style.width = `${Number(clean.dataset.width || 100)}%`;
    }

    if (tagName === 'HR') {
      clean.classList.add('rich-page-break');
      clean.setAttribute('data-page-break', 'true');
    }

    if (tagName === 'IMG') {
      const assetPath = node.getAttribute('data-asset-path') || '';
      const rawSrc = node.getAttribute('src') || '';
      if (assetPath) {
        clean.setAttribute('data-asset-path', assetPath);
      }

      const resolvedSrc = assetPath ? await resolveAssetUrl(assetPath) : rawSrc;
      if (resolvedSrc) {
        clean.setAttribute('src', resolvedSrc);
      }

      clean.setAttribute('alt', node.getAttribute('alt') || 'Image');
    }

    if (VOID_TAGS.has(tagName)) {
      return clean;
    }

    for (const child of Array.from(node.childNodes)) {
      const sanitizedChild = await sanitizeNode(child, targetDocument, resolveAssetUrl);
      if (sanitizedChild) {
        clean.appendChild(sanitizedChild);
      }
    }

    return clean;
  }

  async function prepareHtml(rawHtml, resolveAssetUrl) {
    const parser = new DOMParser();
    const source = parser.parseFromString(`<div>${rawHtml || '<p></p>'}</div>`, 'text/html');
    const cleanRoot = document.createElement('div');

    for (const child of Array.from(source.body.firstElementChild?.childNodes || [])) {
      const sanitizedChild = await sanitizeNode(child, document, resolveAssetUrl);
      if (sanitizedChild) {
        cleanRoot.appendChild(sanitizedChild);
      }
    }

    if (!cleanRoot.innerHTML.trim()) {
      cleanRoot.innerHTML = '<p></p>';
    }

    return cleanRoot.innerHTML;
  }

  function splitTextNodeToFit(node, targetContainer, pageRoot) {
    const text = node.textContent || '';
    if (!text) {
      return { fit: null, remainder: null };
    }

    const probe = document.createTextNode(text);
    targetContainer.appendChild(probe);
    if (!isOverflow(pageRoot)) {
      return { fit: probe, remainder: null };
    }

    targetContainer.removeChild(probe);

    const testNode = document.createTextNode('');
    targetContainer.appendChild(testNode);

    let low = 0;
    let high = text.length;
    let best = 0;
    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      testNode.textContent = text.slice(0, mid);
      if (!isOverflow(pageRoot)) {
        best = mid;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }

    targetContainer.removeChild(testNode);
    best = normalizeSplitIndex(text, best);

    if (best <= 0) {
      return {
        fit: null,
        remainder: document.createTextNode(text)
      };
    }

    const fit = document.createTextNode(text.slice(0, best));
    targetContainer.appendChild(fit);
    const remainderText = text.slice(best).replace(/^\s+/, '');

    return {
      fit,
      remainder: remainderText ? document.createTextNode(remainderText) : null
    };
  }

  function splitElementNodeToFit(node, targetContainer, pageRoot) {
    const clone = node.cloneNode(false);
    targetContainer.appendChild(clone);

    if (!node.childNodes.length) {
      if (!isOverflow(pageRoot)) {
        return { fit: clone, remainder: null };
      }

      targetContainer.removeChild(clone);
      return {
        fit: null,
        remainder: node.cloneNode(true)
      };
    }

    let remainder = null;
    const children = Array.from(node.childNodes);
    for (let index = 0; index < children.length; index += 1) {
      const child = children[index];
      if (child.nodeType === Node.ELEMENT_NODE && child.matches?.('hr.rich-page-break,[data-page-break="true"]')) {
        remainder = node.cloneNode(false);
        remainder.append(cloneNodeInto(child, document));
        for (const sibling of children.slice(index + 1)) {
          remainder.append(cloneNodeInto(sibling, document));
        }
        break;
      }

      const childResult = splitNodeToFit(child, clone, pageRoot);
      if (!childResult.remainder) {
        continue;
      }

      remainder = node.cloneNode(false);
      remainder.append(childResult.remainder);
      for (const sibling of children.slice(index + 1)) {
        remainder.append(cloneNodeInto(sibling, document));
      }
      break;
    }

    if (!clone.childNodes.length && remainder) {
      targetContainer.removeChild(clone);
      return {
        fit: null,
        remainder: node.cloneNode(true)
      };
    }

    return {
      fit: clone,
      remainder
    };
  }

  function splitNodeToFit(node, targetContainer, pageRoot) {
    if (node.nodeType === Node.TEXT_NODE) {
      return splitTextNodeToFit(node, targetContainer, pageRoot);
    }

    if (node.nodeType !== Node.ELEMENT_NODE) {
      return { fit: null, remainder: null };
    }

    return splitElementNodeToFit(node, targetContainer, pageRoot);
  }

  function ensureVisibleContent(pageRoot) {
    if (!pageRoot.childNodes.length) {
      pageRoot.innerHTML = '<p></p>';
    }
  }

  function paginatePreparedHtml(html, labElement) {
    const source = document.createElement('div');
    source.innerHTML = html || '<p></p>';

    const pages = [];
    let remaining = Array.from(source.childNodes);

    while (remaining.length > 0) {
      const pageRoot = document.createElement('div');
      pageRoot.className = 'rich-content-root';

      const pageShell = document.createElement('div');
      pageShell.className = 'pagination-page-shell';
      pageShell.append(pageRoot);
      labElement.append(pageShell);

      let nextNodes = [];
      let consumedAny = false;

      for (let index = 0; index < remaining.length; index += 1) {
        const node = remaining[index];
        if (node.nodeType === Node.ELEMENT_NODE && node.matches?.('hr.rich-page-break,[data-page-break="true"]')) {
          nextNodes = remaining.slice(index + 1);
          consumedAny = true;
          break;
        }

        const result = splitNodeToFit(node, pageRoot, pageShell);
        if (!result.remainder) {
          consumedAny = true;
          continue;
        }

        nextNodes = [result.remainder, ...remaining.slice(index + 1)];
        break;
      }

      if (!consumedAny) {
        nextNodes = remaining.slice(1);
        pageRoot.append(cloneNodeInto(remaining[0], document));
      }

      ensureVisibleContent(pageRoot);
      pages.push(pageRoot.innerHTML);
      labElement.removeChild(pageShell);
      remaining = nextNodes;
    }

    return pages.length > 0 ? pages : ['<p></p>'];
  }

  window.richContentRuntime = {
    paginatePreparedHtml,
    prepareHtml
  };
})();
