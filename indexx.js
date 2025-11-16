  // ================== SECTION 2 – LINKED ALLOCATION ==================
  // A-6, B-5, C-3, D-7, E-6, E-2  -> нийт 29 блок
  // Тэгэхээр 40 блоктой диск дээр байрлуулъя.
  const TOTAL_BLOCKS2 = 40;
  const files2 = {
    A: 6,
    B: 5,
    C: 3,
    D: 7,
    E: 6,   // E (6 блок)
    E2: 2   // E (2 блок)  -> UI дээр "E (2 блок)" гэж харуулна
  };

  let next2   = new Array(TOTAL_BLOCKS2).fill(-1);   // дараагийн блокийн индекс
  let owner2  = new Array(TOTAL_BLOCKS2).fill(null); // аль файл эзэмшиж байгаа
  let fileStarts2 = {};                              // файл -> эхлэх блок
  let busy2 = false;

  const disk2El       = document.getElementById("disk2");
  const fileStarts2El = document.getElementById("fileStarts2");
  const explain2      = document.getElementById("explain2");
  const btnExample2   = document.getElementById("btnExample2");
  const btnTraverse2  = document.getElementById("btnTraverse2");
  const btnReset2     = document.getElementById("btnReset2");
  const fileSelect2   = document.getElementById("fileSelect2");

  function renderDisk2() {
    disk2El.innerHTML = "";
    for (let i = 0; i < TOTAL_BLOCKS2; i++) {
      const row = document.createElement("div");
      row.classList.add("link-row");

      const idx = document.createElement("div");
      idx.classList.add("link-idx");
      idx.textContent = i;

      const wrap = document.createElement("div");
      wrap.classList.add("link-block-wrapper");

      const block = document.createElement("div");
      block.classList.add("block");
      if (owner2[i] == null) {
        block.classList.add("free");
        block.textContent = "";
      } else {
        const c = (typeof colorMap !== "undefined" && colorMap[owner2[i]])
          ? colorMap[owner2[i]]
          : "#4ade80";
        block.style.background = c;
        block.style.color = "#020617";
        block.textContent = next2[i]; // дараагийн блокийн индекс
      }

      wrap.appendChild(block);
      row.appendChild(idx);
      row.appendChild(wrap);
      disk2El.appendChild(row);
    }
  }

  function displayNameForFile(key) {
    if (key === "E2") return "E (2 блок)";
    if (key === "E")  return "E (6 блок)";
    return key;
  }

  function renderFileStarts2() {
    const lines = [];
    for (const [name, size] of Object.entries(files2)) {
      const start = fileStarts2[name];
      if (start != null && start !== undefined) {
        const label = displayNameForFile(name);
        lines.push(`Файл <b>${label}</b> (${size} блок) эхлэх блок: <b>${start}</b>`);
      }
    }
    fileStarts2El.innerHTML = lines.join("<br>");
  }

  function resetLinked() {
    next2.fill(-1);
    owner2.fill(null);
    fileStarts2 = {};
    renderDisk2();
    fileStarts2El.innerHTML = "";
    explain2.innerHTML =
      '';
  }

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function exampleLinked() {
    if (busy2) return;
    next2.fill(-1);
    owner2.fill(null);
    fileStarts2 = {};

    let free = shuffle(Array.from({ length: TOTAL_BLOCKS2 }, (_, i) => i));

    for (const [name, size] of Object.entries(files2)) {
      if (free.length < size) break;
      const chain = free.splice(0, size); // тухайн файлд оногдох блокууд
      fileStarts2[name] = chain[0];       // эхний блок

      for (let k = 0; k < chain.length; k++) {
        const idx = chain[k];
        owner2[idx] = name;
        next2[idx]  = (k < chain.length - 1) ? chain[k + 1] : -1;
      }
    }

    renderDisk2();
    renderFileStarts2();
    explain2.innerHTML =
      '<div class="step-label">Жишээ байршуулалт</div>' +
      'Нэг файл олон газарт тарж байрласан ч блок бүр дотроо дараагийн блокийн хаягийг ' +
      'хадгалж байгаа тул pointer-уудыг дагаад файлыг уншиж чадна.';
  }

  async function traverseFile2(name) {
    if (busy2) return;

    const key   = name;                    // select-ийн value яг key
    const label = displayNameForFile(key);
    const start = fileStarts2[key];

    if (start == null) {
      explain2.innerHTML =
        `<div class="step-label">Traverse хийж чадсангүй</div>` +
        `Файл <b>${label}</b> одоогоор байрлуулаагүй байна. Эхлээд "Жишээ байрлуулах" дар.`;
      return;
    }

    const blocks = disk2El.querySelectorAll(".block");
    blocks.forEach(b => b.classList.remove("hl"));

    busy2 = true;
    let cur = start;
    const path = [];
    while (cur !== -1 && cur >= 0 && cur < TOTAL_BLOCKS2) {
      path.push(cur);
      blocks[cur].classList.add("hl");
      await sleep(450);          // Section 1-ийн sleep-ийг ашиглаж байна
      cur = next2[cur];
    }
    busy2 = false;
    path.push("-1");

    explain2.innerHTML =
      `<div class="step-label">Файл ${label}-ийн pointer-ыг дагасан явц</div>` +
      `Эхлэх блок <b>${start}</b> → зам: <code>${path.join(" → ")}</code>. ` +
      `Сүүлчийн блок дээр pointer нь -1 болж файлын төгсгөл гэдгийг заана.`;
  }

  // event listeners for section 2
  btnExample2.addEventListener("click", exampleLinked);
  btnReset2.addEventListener("click", resetLinked);
  btnTraverse2.addEventListener("click", () => {
    traverseFile2(fileSelect2.value);
  });

  // эхний төлөв
  resetLinked();
