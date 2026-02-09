/**
 * Hangul Explorer - Interactive Logic
 * Handles character grids, syllable building, audio playback, and word discovery
 */

// ============================================
// State
// ============================================

let hangulData = null;
let selectedConsonant = null;
let selectedVowel = null;
let currentSection = 'consonants';
let currentWordCategory = 'greetings';
let wordCardIdx = 0;
let wordFlipped = false;
let shuffledWords = null;
let synth = window.speechSynthesis;
let koreanVoice = null;
let currentAudio = null;
let audioGeneration = 0; // Generation counter to cancel stale audio callbacks

// Stop any currently playing audio before starting new playback
function stopAllAudio() {
    audioGeneration++; // Invalidate all pending audio callbacks
    if (currentAudio) {
        currentAudio.pause();
        currentAudio.currentTime = 0;
        currentAudio = null;
    }
    if (synth) synth.cancel();
}

// ============================================
// Initialization
// ============================================

document.addEventListener('DOMContentLoaded', async () => {
    await loadData();
    findKoreanVoice();
    renderConsonantGrid();
    renderVowelGrid();
    renderBuilder();
    renderWordDiscovery();
    initNavigation();

    // speechSynthesis voices may load asynchronously
    if (synth.onvoiceschanged !== undefined) {
        synth.onvoiceschanged = findKoreanVoice;
    }
});

async function loadData() {
    try {
        const response = await fetch('data/hangul-data.json');
        hangulData = await response.json();
    } catch (err) {
        console.error('Failed to load hangul data:', err);
    }
}

function findKoreanVoice() {
    const voices = synth.getVoices();
    koreanVoice = voices.find(v => v.lang === 'ko-KR') ||
                  voices.find(v => v.lang.startsWith('ko'));
}

// ============================================
// Navigation
// ============================================

function initNavigation() {
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const section = btn.dataset.section;
            switchSection(section);
        });
    });
}

function switchSection(sectionId) {
    currentSection = sectionId;

    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.section === sectionId);
    });

    document.querySelectorAll('.section').forEach(sec => {
        sec.classList.toggle('active', sec.id === sectionId);
    });
}

// ============================================
// Audio Playback
// ============================================

function playAudio(audioFile, fallbackText) {
    stopAllAudio();
    const gen = audioGeneration; // Capture generation at call time
    const basePath = 'audio/' + audioFile.replace(/\.[^.]+$/, '');
    const ttsPath = 'audio/tts/' + audioFile.replace(/\.[^.]+$/, '') + '.mp3';
    const webmPath = basePath + '.webm';
    const mp3Path = basePath + '.mp3';

    const tryPlay = (path) => {
        if (gen !== audioGeneration) return Promise.reject('cancelled');
        return new Promise((resolve, reject) => {
            const audio = new Audio(path);
            audio.oncanplaythrough = () => {
                if (gen !== audioGeneration) { audio.pause(); reject('cancelled'); return; }
                currentAudio = audio;
                audio.play().then(resolve).catch(reject);
            };
            audio.onerror = reject;
        });
    };

    tryPlay(webmPath)
        .catch(e => { if (e === 'cancelled') return; return tryPlay(mp3Path); })
        .catch(e => { if (e === 'cancelled') return; return tryPlay(ttsPath); })
        .catch(e => { if (e === 'cancelled') return; speakKorean(fallbackText); });
}


function speakKorean(text) {
    stopAllAudio();
    if (!synth) return;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'ko-KR';
    if (koreanVoice) {
        utterance.voice = koreanVoice;
    }
    utterance.rate = 0.8;
    utterance.pitch = 1;
    synth.speak(utterance);
}

// ============================================
// Consonant Grid
// ============================================

function renderConsonantGrid() {
    const container = document.getElementById('consonant-grid');
    if (!container || !hangulData) return;

    const groups = {
        basic: hangulData.consonants.filter(c => c.type === 'basic'),
        aspirated: hangulData.consonants.filter(c => c.type === 'aspirated'),
        double: hangulData.consonants.filter(c => c.type === 'double')
    };

    container.innerHTML = '';

    // Basic consonants - always visible
    container.innerHTML += renderCharGroup('Basic Consonants', 'basic', groups.basic, 'consonant');
    // Aspirated + Double - collapsible
    container.innerHTML += `<div class="collapsible-section">
        <button class="collapse-toggle" onclick="toggleCollapse(this)">
            Aspirated & Double Consonants <span class="collapse-count">${groups.aspirated.length + groups.double.length}</span>
            <span class="collapse-arrow">+</span>
        </button>
        <div class="collapse-content" style="display:none">
            ${renderCharGroup('Aspirated Consonants', 'aspirated', groups.aspirated, 'consonant')}
            ${renderCharGroup('Double (Tense) Consonants', 'double', groups.double, 'consonant')}
        </div>
    </div>`;

    // Tips - collapsible
    container.innerHTML += `<div class="collapsible-section">
        <button class="collapse-toggle" onclick="toggleCollapse(this)">
            Teaching Tips <span class="collapse-arrow">+</span>
        </button>
        <div class="collapse-content" style="display:none">
            ${renderConsonantTips()}
        </div>
    </div>`;

    // Add click listeners
    container.querySelectorAll('.char-cell[data-type="consonant"]').forEach(cell => {
        cell.addEventListener('click', () => handleConsonantClick(cell));
    });
}

function renderCharGroup(title, badgeClass, chars, dataType) {
    const badgeLabels = {
        basic: 'Basic',
        aspirated: 'Aspirated (+air)',
        double: 'Tense (no air)',
        'basic-vertical': 'Vertical',
        'basic-horizontal': 'Horizontal',
        'y-vertical': 'Y-vertical',
        'y-horizontal': 'Y-horizontal',
        compound: 'Compound'
    };

    let html = `
        <div class="char-group">
            <div class="char-group-label">
                <h3>${title}</h3>
                <span class="badge badge-${badgeClass}">${badgeLabels[badgeClass] || badgeClass}</span>
            </div>
            <div class="char-grid">`;

    chars.forEach(c => {
        const extraClass = c.type === 'aspirated' ? 'aspirated-cell' :
                          c.type === 'double' ? 'double-cell' : '';
        const tipHtml = getCharTooltip(c);

        html += `
            <div class="char-cell ${extraClass}"
                 data-type="${dataType}"
                 data-char="${c.char}"
                 data-rom="${c.romanization}"
                 data-audio="${c.audioFile || ''}">
                <div class="char-main">${c.char}</div>
                <div class="char-rom">${c.romanization}</div>
                ${tipHtml}
                <div class="audio-indicator">
                    <svg viewBox="0 0 24 24"><polygon points="5,3 19,12 5,21"/></svg>
                </div>
            </div>`;
    });

    html += `</div></div>`;
    return html;
}

function getCharTooltip(charData) {
    if (!charData.mnemonic) return '';

    let tip = charData.mnemonic.text;

    if (charData.whisperTest) {
        tip += '<br><strong>Whisper Test:</strong> Try whispering - if it feels natural, it\'s aspirated!';
    }

    if (charData.articulatory) {
        tip += `<br><em>${charData.articulatory}</em>`;
    }

    return `<div class="teaching-tip">${tip}</div>`;
}

function renderConsonantTips() {
    const tips = hangulData.teachingTips;
    return `
        <div class="tips-panel">
            <h3>Teaching Tips</h3>
            <div class="tip-card">
                <h4>${tips.whisperTest.title}</h4>
                <p>${tips.whisperTest.description}</p>
            </div>
            <div class="tip-card">
                <h4>${tips.aspirationPattern.title}</h4>
                <p>${tips.aspirationPattern.description}</p>
                <div class="tip-pairs">
                    ${tips.aspirationPattern.pairs.map(p => `<span class="tip-pair">${p}</span>`).join('')}
                </div>
            </div>
            <div class="tip-card">
                <h4>${tips.doublePattern.title}</h4>
                <p>${tips.doublePattern.description}</p>
                <div class="tip-pairs">
                    ${tips.doublePattern.pairs.map(p => `<span class="tip-pair">${p}</span>`).join('')}
                </div>
            </div>
        </div>`;
}

function handleConsonantClick(cell) {
    const char = cell.dataset.char;
    const charData = hangulData.consonants.find(c => c.char === char);

    // Always select (don't toggle off on re-click, just replay audio)
    document.querySelectorAll('.char-cell.consonant-selected').forEach(c => c.classList.remove('consonant-selected'));
    selectedConsonant = char;
    cell.classList.add('consonant-selected');

    // Sync builder mini-grid
    syncBuilderSelection('initial', char);

    // Play audio
    if (charData) {
        playAudio(charData.audioFile, charData.char);
    }

    updateBuilder();
}

// ============================================
// Vowel Grid
// ============================================

function renderVowelGrid() {
    const container = document.getElementById('vowel-grid');
    if (!container || !hangulData) return;

    const groups = {
        'basic-vertical': hangulData.vowels.filter(v => v.type === 'basic-vertical'),
        'basic-horizontal': hangulData.vowels.filter(v => v.type === 'basic-horizontal'),
        'y-vertical': hangulData.vowels.filter(v => v.type === 'y-vertical'),
        'y-horizontal': hangulData.vowels.filter(v => v.type === 'y-horizontal'),
        compound: hangulData.vowels.filter(v => v.type === 'compound')
    };

    container.innerHTML = '';

    // Basic vowels - always visible
    container.innerHTML += renderCharGroup('Basic Vowels', 'basic-vertical',
        [...groups['basic-vertical'], ...groups['basic-horizontal']], 'vowel');

    // Y-variants + Compound - collapsible
    container.innerHTML += `<div class="collapsible-section">
        <button class="collapse-toggle" onclick="toggleCollapse(this)">
            Y-Vowels & Compound Vowels <span class="collapse-count">${groups['y-vertical'].length + groups['y-horizontal'].length + groups.compound.length}</span>
            <span class="collapse-arrow">+</span>
        </button>
        <div class="collapse-content" style="display:none">
            ${renderCharGroup('Y-Vowels', 'y-vertical',
                [...groups['y-vertical'], ...groups['y-horizontal']], 'vowel')}
            ${renderCharGroup('Compound Vowels', 'compound', groups.compound, 'vowel')}
        </div>
    </div>`;

    // Tips - collapsible
    container.innerHTML += `<div class="collapsible-section">
        <button class="collapse-toggle" onclick="toggleCollapse(this)">
            Vowel Tips <span class="collapse-arrow">+</span>
        </button>
        <div class="collapse-content" style="display:none">
            ${renderVowelTips()}
        </div>
    </div>`;

    // Add click listeners
    container.querySelectorAll('.char-cell[data-type="vowel"]').forEach(cell => {
        cell.addEventListener('click', () => handleVowelClick(cell));
    });
}

function renderVowelTips() {
    const tips = hangulData.teachingTips;
    return `
        <div class="tips-panel">
            <h3>Vowel Tips</h3>
            <div class="tip-card">
                <h4>${tips.handPosition.title}</h4>
                <p>${tips.handPosition.description}</p>
                <p style="margin-top:6px;font-size:0.78rem;color:#888">${tips.handPosition.detail}</p>
            </div>
            <div class="tip-card">
                <h4>${tips.yPattern.title}</h4>
                <p>${tips.yPattern.description}</p>
                <div class="tip-pairs">
                    ${tips.yPattern.pairs.map(p => `<span class="tip-pair">${p}</span>`).join('')}
                </div>
            </div>
            <div class="tip-card">
                <h4>Vertical vs Horizontal</h4>
                <p><strong>Vertical vowels</strong> (\u314f \u3153 \u3163 etc.) go to the <strong>RIGHT</strong> of the consonant (Type B).</p>
                <p><strong>Horizontal vowels</strong> (\u3157 \u315c \u3161 etc.) go <strong>BELOW</strong> the consonant (Type A).</p>
            </div>
        </div>`;
}

function handleVowelClick(cell) {
    const char = cell.dataset.char;
    const charData = hangulData.vowels.find(v => v.char === char);

    // Always select
    document.querySelectorAll('.char-cell.vowel-selected').forEach(c => c.classList.remove('vowel-selected'));
    selectedVowel = char;
    cell.classList.add('vowel-selected');

    // Sync builder mini-grid
    syncBuilderSelection('medial', char);

    if (charData) {
        playAudio(charData.audioFile, charData.char);
    }

    updateBuilder();
}

// ============================================
// Syllable Builder
// ============================================

function renderBuilder() {
    const container = document.getElementById('builder-section');
    if (!container || !hangulData) return;

    container.innerHTML = `
        <div class="section-header">
            <h2>Syllable Builder</h2>
            <p>Select a consonant + vowel to build a syllable block.</p>
        </div>
        <div class="builder-container">
            <div class="builder-panel">
                ${renderBuilderStep(1, 'Initial Consonant (\uCD08\uC131)', hangulData.consonants, 'initial')}
                ${renderBuilderStep(2, 'Vowel (\uC911\uC131)', hangulData.vowels, 'medial')}
            </div>
            <div>
                <div class="builder-preview" id="builder-preview">
                    <div class="syllable-display" id="syllable-display">
                        <span class="placeholder-text">Select consonant + vowel</span>
                    </div>
                    <div class="syllable-components" id="syllable-components"></div>
                    <div id="type-indicator"></div>
                    <div class="builder-actions">
                        <button class="builder-btn primary" id="play-syllable-btn" onclick="playSyllable()" disabled>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="white"><polygon points="5,3 19,12 5,21"/></svg>
                            Play Sound
                        </button>
                        <button class="builder-btn danger" onclick="clearBuilder()">Clear</button>
                    </div>
                </div>
            </div>
        </div>`;

    // Add click listeners for builder mini-grids
    container.querySelectorAll('.mini-cell').forEach(cell => {
        cell.addEventListener('click', () => handleBuilderCellClick(cell));
        cell._hasListener = true;
    });
}

function renderBuilderStep(num, title, chars, role) {
    const isOptional = role === 'final';
    const stepClass = num === 1 ? 'step-1' : num === 2 ? 'step-2' : 'step-3';

    // Split into basic (always visible) and extra (collapsible)
    let basicChars, extraChars;
    if (role === 'initial') {
        basicChars = chars.filter(c => c.type === 'basic');
        extraChars = chars.filter(c => c.type !== 'basic');
    } else if (role === 'medial') {
        basicChars = chars.filter(c => c.type === 'basic-vertical' || c.type === 'basic-horizontal');
        extraChars = chars.filter(c => c.type !== 'basic-vertical' && c.type !== 'basic-horizontal');
    } else {
        basicChars = chars;
        extraChars = [];
    }

    let html = `
        <div class="builder-step" id="builder-step-${num}">
            <div class="step-header">
                <span class="step-number ${stepClass}">${num}</span>
                <h3>${title}</h3>
                ${isOptional ? '<span class="optional-tag">Optional</span>' : ''}
            </div>
            <div class="builder-mini-grid">`;

    basicChars.forEach(c => {
        html += `
            <div class="mini-cell" data-role="${role}" data-char="${c.char}" data-rom="${c.romanization || c.sound || ''}">
                ${c.char}
                <span class="mini-rom">${c.romanization || c.sound || ''}</span>
            </div>`;
    });

    html += `</div>`;

    // Extra chars in collapsible
    if (extraChars.length > 0) {
        html += `<div class="builder-more">
            <button class="collapse-toggle mini-toggle" onclick="toggleCollapse(this)">
                More <span class="collapse-count">${extraChars.length}</span>
                <span class="collapse-arrow">+</span>
            </button>
            <div class="collapse-content" style="display:none">
                <div class="builder-mini-grid">`;

        extraChars.forEach(c => {
            html += `
                <div class="mini-cell" data-role="${role}" data-char="${c.char}" data-rom="${c.romanization || c.sound || ''}">
                    ${c.char}
                    <span class="mini-rom">${c.romanization || c.sound || ''}</span>
                </div>`;
        });

        html += `</div></div></div>`;
    }

    html += `</div>`;
    return html;
}

function renderSixSquareGrid() {
    const grid = hangulData.sixSquareGrid;
    let html = `
        <div class="six-square-ref">
            <h3>6-Square Syllable Position Guide</h3>
            <div class="six-grid">`;

    grid.forEach(cell => {
        html += `
            <div class="six-cell">
                <div class="cell-label">${cell.label}</div>
                <div class="cell-example">${cell.example}</div>
                <div class="cell-breakdown">${cell.breakdown}</div>
                <div class="cell-desc">${cell.type}</div>
            </div>`;
    });

    html += `</div></div>`;
    return html;
}

function handleBuilderCellClick(cell) {
    const role = cell.dataset.role;
    const char = cell.dataset.char;

    // Get the parent step container to deselect across ALL grids (basic + extra)
    const step = cell.closest('.builder-step');

    if (role === 'initial') {
        // Toggle off only if clicking same char, otherwise select new
        if (selectedConsonant === char) {
            selectedConsonant = null;
            cell.classList.remove('selected');
        } else {
            step.querySelectorAll('.mini-cell').forEach(c => c.classList.remove('selected'));
            selectedConsonant = char;
            cell.classList.add('selected');
        }
        // Sync the consonant grid section
        syncCharGrid('consonant', selectedConsonant);
    } else if (role === 'medial') {
        if (selectedVowel === char) {
            selectedVowel = null;
            cell.classList.remove('vowel-sel');
        } else {
            step.querySelectorAll('.mini-cell').forEach(c => c.classList.remove('vowel-sel'));
            selectedVowel = char;
            cell.classList.add('vowel-sel');
        }
        // Sync the vowel grid section
        syncCharGrid('vowel', selectedVowel);
    }

    // Play the character audio using recorded/TTS audio
    const cData = hangulData.consonants.find(c => c.char === char);
    const vData = hangulData.vowels.find(v => v.char === char);
    if (cData && cData.audioFile) {
        playAudio(cData.audioFile, char);
    } else if (vData && vData.audioFile) {
        playAudio(vData.audioFile, char);
    } else {
        speakKorean(char);
    }
    updateBuilder();
}

// Sync builder mini-grid selection from char grid clicks
function syncBuilderSelection(role, char) {
    const classMap = { initial: 'selected', medial: 'vowel-sel' };
    const cls = classMap[role];
    document.querySelectorAll(`#builder-section .mini-cell[data-role="${role}"]`).forEach(c => {
        c.classList.toggle(cls, c.dataset.char === char);
    });
}

// Sync char grid section from builder clicks
function syncCharGrid(type, char) {
    if (type === 'consonant') {
        document.querySelectorAll('#consonant-grid .char-cell.consonant-selected').forEach(c => c.classList.remove('consonant-selected'));
        if (char) {
            const gridCell = document.querySelector(`#consonant-grid .char-cell[data-char="${char}"]`);
            if (gridCell) gridCell.classList.add('consonant-selected');
        }
    } else if (type === 'vowel') {
        document.querySelectorAll('#vowel-grid .char-cell.vowel-selected').forEach(c => c.classList.remove('vowel-selected'));
        if (char) {
            const gridCell = document.querySelector(`#vowel-grid .char-cell[data-char="${char}"]`);
            if (gridCell) gridCell.classList.add('vowel-selected');
        }
    }
}

function updateBuilder() {
    const display = document.getElementById('syllable-display');
    const components = document.getElementById('syllable-components');
    const typeIndicator = document.getElementById('type-indicator');
    const playBtn = document.getElementById('play-syllable-btn');

    if (!display) return;

    if (!selectedConsonant || !selectedVowel) {
        display.innerHTML = '<span class="placeholder-text">Select consonant + vowel</span>';
        display.classList.remove('has-content');
        if (components) components.innerHTML = '';
        if (typeIndicator) typeIndicator.innerHTML = '';
        if (playBtn) playBtn.disabled = true;
        return;
    }

    // Build the syllable using Unicode composition
    const syllable = composeSyllable(selectedConsonant, selectedVowel, null);

    display.textContent = syllable;
    display.classList.add('has-content');

    // Component tags
    let compHtml = `<span class="component-tag initial">${selectedConsonant}</span>`;
    compHtml += ` + <span class="component-tag medial">${selectedVowel}</span>`;
    compHtml += ` = <strong style="font-size:1.4rem;margin-left:6px">${syllable}</strong>`;
    if (components) components.innerHTML = compHtml;

    // Type indicator
    const vowelData = hangulData.vowels.find(v => v.char === selectedVowel);
    if (vowelData && typeIndicator) {
        const isHorizontal = vowelData.type === 'basic-horizontal' || vowelData.type === 'y-horizontal';
        if (isHorizontal) {
            typeIndicator.innerHTML = `<span class="type-indicator type-a">Type A: Vowel goes BELOW consonant</span>`;
        } else {
            typeIndicator.innerHTML = `<span class="type-indicator type-b">Type B: Vowel goes to the RIGHT</span>`;
        }
    }

    if (playBtn) playBtn.disabled = false;
}

function composeSyllable(initial, medial, final) {
    // Korean Unicode syllable composition
    // Syllable = 0xAC00 + (initialIndex * 21 + medialIndex) * 28 + finalIndex

    const initialJamo = [
        '\u3131', '\u3132', '\u3134', '\u3137', '\u3138', '\u3139', '\u3141', '\u3142', '\u3143',
        '\u3145', '\u3146', '\u3147', '\u3148', '\u3149', '\u314a', '\u314b', '\u314c', '\u314d', '\u314e'
    ];

    const medialJamo = [
        '\u314f', '\u3150', '\u3151', '\u3152', '\u3153', '\u3154', '\u3155', '\u3156',
        '\u3157', '\u3158', '\u3159', '\u315a', '\u315b', '\u315c', '\u315d', '\u315e',
        '\u315f', '\u3160', '\u3161', '\u3162', '\u3163'
    ];

    const finalJamo = [
        '', '\u3131', '\u3132', '\u3133', '\u3134', '\u3135', '\u3136', '\u3137', '\u3139',
        '\u313a', '\u313b', '\u313c', '\u313d', '\u313e', '\u313f', '\u3140', '\u3141',
        '\u3142', '\u3144', '\u3145', '\u3146', '\u3147', '\u3148', '\u314a', '\u314b',
        '\u314c', '\u314d', '\u314e'
    ];

    const iIdx = initialJamo.indexOf(initial);
    const mIdx = medialJamo.indexOf(medial);
    let fIdx = 0;
    if (final) {
        fIdx = finalJamo.indexOf(final);
        if (fIdx === -1) fIdx = 0;
    }

    if (iIdx === -1 || mIdx === -1) {
        return initial + medial + (final || '');
    }

    const code = 0xAC00 + (iIdx * 21 + mIdx) * 28 + fIdx;
    return String.fromCharCode(code);
}

// Map Korean syllables to TTS filenames (matches generate_tts.py naming)
// Compute romanized TTS filename for any Korean syllable (no batchim)
const INITIAL_ROM = ['g','kk','n','d','tt','r','m','b','pp','s','ss','','j','jj','ch','k','t','p','h'];
const MEDIAL_ROM = ['a','ae','ya','yae','eo','e','yeo','ye','o','wa','wae','oe','yo','u','wo','we','wi','yu','eu','ui','i'];

function getSyllableTtsName(syllable) {
    const code = syllable.charCodeAt(0) - 0xAC00;
    if (code < 0 || code > 11171) return null;
    const initialIdx = Math.floor(code / (21 * 28));
    const medialIdx = Math.floor((code % (21 * 28)) / 28);
    const finalIdx = code % 28;
    if (finalIdx !== 0) return null; // No TTS files for batchim syllables
    const cons = INITIAL_ROM[initialIdx];
    const vowel = MEDIAL_ROM[medialIdx];
    // ㅇ (silent initial, index 11): use vowel + _syl suffix
    return cons === '' ? vowel + '_syl' : cons + vowel;
}

function playSyllable() {
    if (!selectedConsonant || !selectedVowel) return;
    const syllable = composeSyllable(selectedConsonant, selectedVowel, null);
    const display = document.getElementById('syllable-display');
    display.classList.add('playing-audio');
    setTimeout(() => display.classList.remove('playing-audio'), 800);
    const ttsName = getSyllableTtsName(syllable);
    if (ttsName) {
        playTtsOrFallback('syllables', ttsName, syllable);
    } else {
        // Batchim syllables: try word TTS folder, then Web Speech API fallback
        playTtsOrFallback('words', syllable, syllable);
    }
}

function clearBuilder() {
    selectedConsonant = null;
    selectedVowel = null;

    // Clear all selections
    document.querySelectorAll('.consonant-selected, .vowel-selected, .selected, .vowel-sel').forEach(el => {
        el.classList.remove('consonant-selected', 'vowel-selected', 'selected', 'vowel-sel');
    });

    updateBuilder();
}

// ============================================
// Word Discovery
// ============================================

function renderWordDiscovery() {
    const container = document.getElementById('word-section');
    if (!container || !hangulData) return;

    const categories = Object.keys(hangulData.words);

    let catHtml = '<div class="word-categories">';
    const categoryLabels = {
        greetings: 'Greetings',
        family: 'Family & People',
        food: 'Food & Drinks',
        places: 'Places',
        body: 'Body',
        nature: 'Nature & Weather',
        numbers: 'Numbers',
        animals: 'Animals',
        colors: 'Colors',
        actions: 'Actions',
        time: 'Time',
        things: 'Things'
    };

    categories.forEach(cat => {
        const isActive = cat === currentWordCategory ? 'active' : '';
        catHtml += `<button class="cat-btn ${isActive}" data-category="${cat}" onclick="switchWordCategory('${cat}')">${categoryLabels[cat] || cat}</button>`;
    });
    catHtml += '</div>';

    container.innerHTML = `
        <div class="section-header">
            <h2>Word Discovery</h2>
            <p>Tap the card to reveal the meaning, use arrows to navigate!</p>
        </div>
        ${catHtml}
        <div class="word-list" id="word-list"></div>
        <div class="encouragement" id="encouragement"></div>`;

    renderWordFlashcards();
    showRandomEncouragement();
}

function switchWordCategory(category) {
    currentWordCategory = category;
    wordCardIdx = 0;
    wordFlipped = false;
    shuffledWords = null;
    document.querySelectorAll('.cat-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.category === category);
    });
    renderWordFlashcards();
}

function renderWordFlashcards() {
    const container = document.getElementById('word-list');
    if (!container || !hangulData) return;

    const words = shuffledWords || hangulData.words[currentWordCategory] || [];
    if (words.length === 0) { container.innerHTML = ''; return; }
    if (wordCardIdx >= words.length) wordCardIdx = 0;

    const word = words[wordCardIdx];
    wordFlipped = false;

    // Build syllable chips for the back
    const syllableChips = word.syllables.map((syl, j) => {
        const bd = word.breakdown[j];
        const parts = bd ? `${bd.initial}+${bd.vowel}${bd.final ? '+' + bd.final : ''}` : '';
        return `<div class="syllable-chip" onclick="event.stopPropagation(); playSyllableChip(this, '${syl}')" title="${parts}">
            <span class="syllable-char">${syl}</span>
            <span class="syllable-parts">${parts}</span>
        </div>`;
    }).join('<span class="syllable-plus">+</span>');

    container.innerHTML = `
        <div class="word-flashcard-area">
            <div class="word-flashcard" id="word-flashcard" onclick="flipWordCard()">
                <div class="word-flashcard-inner" id="word-flashcard-inner">
                    <div class="word-flashcard-front">
                        <div class="wf-korean">${word.korean}</div>
                        <button class="wf-play-btn" onclick="event.stopPropagation(); playWord('${word.korean}')" title="Play sound">
                            <svg viewBox="0 0 24 24" width="20" height="20"><polygon points="5,3 19,12 5,21" fill="white"/></svg>
                        </button>
                    </div>
                    <div class="word-flashcard-back">
                        <div class="wf-english">${word.english}</div>
                        <div class="wf-romanization">${word.romanization}</div>
                        <div class="wf-syllables">${syllableChips}</div>
                    </div>
                </div>
            </div>
            <div class="word-fc-controls">
                <button class="wf-nav-btn" onclick="prevWordCard()" title="Previous">
                    <svg viewBox="0 0 24 24" width="20" height="20"><polyline points="15,18 9,12 15,6" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
                </button>
                <span class="wf-progress">${wordCardIdx + 1} / ${words.length}</span>
                <button class="wf-nav-btn" onclick="nextWordCard()" title="Next">
                    <svg viewBox="0 0 24 24" width="20" height="20"><polyline points="9,6 15,12 9,18" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
                </button>
            </div>
            <div class="word-fc-actions">
                <button class="wf-action-btn" onclick="shuffleWords()">Shuffle</button>
            </div>
        </div>`;
}

function flipWordCard() {
    wordFlipped = !wordFlipped;
    const inner = document.getElementById('word-flashcard-inner');
    if (inner) inner.classList.toggle('flipped', wordFlipped);
}

function nextWordCard() {
    const words = shuffledWords || hangulData.words[currentWordCategory] || [];
    wordCardIdx = (wordCardIdx + 1) % words.length;
    renderWordFlashcards();
}

function prevWordCard() {
    const words = shuffledWords || hangulData.words[currentWordCategory] || [];
    wordCardIdx = (wordCardIdx - 1 + words.length) % words.length;
    renderWordFlashcards();
}

function shuffleWords() {
    const original = hangulData.words[currentWordCategory] || [];
    shuffledWords = [...original].sort(() => Math.random() - 0.5);
    wordCardIdx = 0;
    renderWordFlashcards();
}

function playSyllableChip(element, syllable) {
    // Visual feedback
    element.classList.add('playing');
    setTimeout(() => element.classList.remove('playing'), 600);
    const ttsName = getSyllableTtsName(syllable);
    if (ttsName) {
        playTtsOrFallback('syllables', ttsName, syllable);
    } else {
        playTtsOrFallback('words', syllable, syllable);
    }
}

function playWord(word) {
    // Look up word filename from data
    const allWords = Object.values(hangulData.words).flat();
    const wordData = allWords.find(w => w.korean === word);
    if (wordData) {
        const filename = wordData.romanization.replace(/-/g, '');
        playTtsOrFallback('words', filename, word);
    } else {
        playTtsOrFallback('syllables', word, word);
    }
}

function playTtsOrFallback(folder, filename, fallbackText) {
    stopAllAudio();
    const gen = audioGeneration;
    const path = 'audio/tts/' + folder + '/' + filename + '.mp3';
    const a = new Audio(path);
    a.oncanplaythrough = () => {
        if (gen !== audioGeneration) { a.pause(); return; }
        currentAudio = a;
        a.play().catch(() => { if (gen === audioGeneration) speakKorean(fallbackText); });
    };
    a.onerror = () => { if (gen === audioGeneration) speakKorean(fallbackText); };
}

function toggleCollapse(btn) {
    const content = btn.nextElementSibling;
    const arrow = btn.querySelector('.collapse-arrow');
    if (content.style.display === 'none') {
        content.style.display = '';
        arrow.textContent = '\u2212';
        // Re-attach click listeners for newly visible cells
        content.querySelectorAll('.char-cell[data-type="consonant"]').forEach(cell => {
            if (!cell._hasListener) {
                cell.addEventListener('click', () => handleConsonantClick(cell));
                cell._hasListener = true;
            }
        });
        content.querySelectorAll('.char-cell[data-type="vowel"]').forEach(cell => {
            if (!cell._hasListener) {
                cell.addEventListener('click', () => handleVowelClick(cell));
                cell._hasListener = true;
            }
        });
        content.querySelectorAll('.mini-cell').forEach(cell => {
            if (!cell._hasListener) {
                cell.addEventListener('click', () => handleBuilderCellClick(cell));
                cell._hasListener = true;
            }
        });
    } else {
        content.style.display = 'none';
        arrow.textContent = '+';
    }
}

function showRandomEncouragement() {
    const el = document.getElementById('encouragement');
    if (!el || !hangulData) return;

    const messages = hangulData.teachingTips.errorNormalization.messages;
    const msg = messages[Math.floor(Math.random() * messages.length)];
    el.textContent = msg;

    // Rotate every 15 seconds
    setInterval(() => {
        const newMsg = messages[Math.floor(Math.random() * messages.length)];
        el.style.opacity = 0;
        setTimeout(() => {
            el.textContent = newMsg;
            el.style.opacity = 1;
        }, 300);
    }, 15000);
}
