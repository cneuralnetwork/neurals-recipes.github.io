// --- App Logic ---

let currentRecipe = null;
let recipes = [];

// Parse YAML frontmatter from markdown content
function parseFrontmatter(content) {
    const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/;
    const match = content.match(frontmatterRegex);
    
    if (!match) {
        console.warn('No frontmatter found in content');
        return { metadata: {}, markdown: content };
    }
    
    const frontmatterText = match[1];
    const markdown = match[2];
    const metadata = {};
    
    // Simple YAML parser
    const lines = frontmatterText.split('\n');
    let currentKey = null;
    let nestedObj = null;
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();
        
        if (!trimmed) continue;
        
        // Check if it's a nested object property (indented with 2 spaces, not 4+)
        if (line.startsWith('  ') && !line.startsWith('    ')) {
            if (nestedObj !== null && currentKey) {
                const nestedMatch = trimmed.match(/^(\w+):\s*(.+)$/);
                if (nestedMatch) {
                    nestedObj[nestedMatch[1]] = parseValue(nestedMatch[2]);
                }
            }
            continue;
        }
        
        // Save previous nested object if we have one and we're moving to a new top-level key
        if (nestedObj !== null && currentKey) {
            metadata[currentKey] = nestedObj;
            nestedObj = null;
            currentKey = null;
        }
        
        // Parse top-level key-value pair
        const keyMatch = trimmed.match(/^(\w+):\s*(.*)$/);
        if (keyMatch) {
            // Save previous simple key-value if exists (shouldn't happen, but just in case)
            if (currentKey && nestedObj === null) {
                // This shouldn't happen, but handle it
            }
            
            currentKey = keyMatch[1];
            const value = keyMatch[2].trim();
            
            // Check if next non-empty line is nested (starts with 2 spaces)
            let nextLineIndex = i + 1;
            while (nextLineIndex < lines.length && lines[nextLineIndex].trim() === '') {
                nextLineIndex++;
            }
            
            if (nextLineIndex < lines.length && lines[nextLineIndex].startsWith('  ')) {
                nestedObj = {};
            } else if (value) {
                metadata[currentKey] = parseValue(value);
                currentKey = null;
            }
            // If value is empty and next line is nested, we'll collect it in the nested object
        }
    }
    
    // Save last nested object if exists
    if (nestedObj !== null && currentKey) {
        metadata[currentKey] = nestedObj;
    }
    
    return { metadata, markdown };
}

function parseValue(value) {
    value = value.trim();
    // Remove quotes if present
    if ((value.startsWith('"') && value.endsWith('"')) || 
        (value.startsWith("'") && value.endsWith("'"))) {
        return value.slice(1, -1);
    }
    // Try to parse as number
    if (!isNaN(value) && value !== '') {
        return Number(value);
    }
    return value;
}

// Load recipes from markdown files
async function loadRecipes() {
    try {
        // Load manifest
        const manifestResponse = await fetch('content/recipes-manifest.json');
        if (!manifestResponse.ok) {
            throw new Error(`Failed to load manifest: ${manifestResponse.status}`);
        }
        const manifest = await manifestResponse.json();
        console.log('Loaded manifest:', manifest);
        
        // Load each markdown file
        recipes = await Promise.all(
            manifest.map(async (filename, index) => {
                try {
                    const response = await fetch(`content/${filename}`);
                    if (!response.ok) {
                        throw new Error(`Failed to load ${filename}: ${response.status}`);
                    }
                    const content = await response.text();
                    const { metadata, markdown } = parseFrontmatter(content);
                    
                    console.log(`Parsed ${filename}:`, metadata);
                    
                    return {
                        id: index + 1,
                        title: metadata.title || '',
                        category: metadata.category || '',
                        time: metadata.time || '',
                        servings: metadata.servings || '',
                        rating: metadata.rating || '',
                        image: metadata.image || '',
                        nutrition: metadata.nutrition || { cal: 0, pro: 0, carb: 0, fat: 0 },
                        md: markdown
                    };
                } catch (err) {
                    console.error(`Error loading ${filename}:`, err);
                    return null;
                }
            })
        );
        
        // Filter out any failed loads
        recipes = recipes.filter(r => r !== null);
        console.log('Loaded recipes:', recipes);
        
        if (recipes.length === 0) {
            console.error('No recipes loaded!');
            return;
        }
        
        renderList();
    } catch (error) {
        console.error('Error loading recipes:', error);
    }
}

function init() {
    lucide.createIcons();
    loadRecipes();
}

// Render Recipe List
function renderList() {
    const listContainer = document.getElementById('recipe-list');
    listContainer.innerHTML = '';

    recipes.forEach(recipe => {
        const card = document.createElement('div');
        card.className = `recipe-card bg-white p-3 rounded-lg border border-sage-100 cursor-pointer flex gap-3 transition-all hover:border-sage-300`;
        card.onclick = () => selectRecipe(recipe.id, card);
        
        card.innerHTML = `
            <img src="${recipe.image}" class="w-20 h-20 rounded-md object-cover flex-shrink-0" alt="${recipe.title}">
            <div class="flex flex-col justify-center">
                <span class="text-xs text-sage-500 font-bold uppercase tracking-wide">${recipe.category}</span>
                <h3 class="font-serif text-gray-800 leading-tight">${recipe.title}</h3>
                <div class="flex items-center gap-2 mt-2 text-xs text-gray-400">
                    <span><i class="inline w-3 h-3" data-lucide="clock"></i> ${recipe.time}</span>
                    <span>•</span>
                    <span>${recipe.nutrition.cal} kcal</span>
                </div>
            </div>
        `;
        listContainer.appendChild(card);
    });
    lucide.createIcons();
}

// Select a Recipe
function selectRecipe(id, cardElement) {
    currentRecipe = recipes.find(r => r.id === id);

    // UI Updates for Selection
    document.querySelectorAll('.recipe-card').forEach(c => c.classList.remove('active'));
    cardElement.classList.add('active');

    // Show Dashboard
    document.getElementById('empty-state').classList.add('hidden');
    const dashboard = document.getElementById('nutrition-dashboard');
    dashboard.classList.remove('hidden');
    
    // Retrigger animation
    dashboard.classList.remove('fade-in');
    void dashboard.offsetWidth; // trigger reflow
    dashboard.classList.add('fade-in');

    // Populate Data
    document.getElementById('dash-title').innerText = currentRecipe.title;
    document.getElementById('dash-category').innerText = currentRecipe.category;
    document.getElementById('dash-time').innerText = currentRecipe.time;
    document.getElementById('dash-servings').innerText = currentRecipe.servings + " people";
    document.getElementById('dash-rating').innerText = currentRecipe.rating;
    document.getElementById('dash-image').src = currentRecipe.image;

    // Animate Numbers (Simple count up)
    animateValue("nutri-cal", 0, currentRecipe.nutrition.cal, 500);
    animateValue("nutri-pro", 0, currentRecipe.nutrition.pro, 500);
    animateValue("nutri-carb", 0, currentRecipe.nutrition.carb, 500);
    animateValue("nutri-fat", 0, currentRecipe.nutrition.fat, 500);
}

// Number Animation Helper
function animateValue(id, start, end, duration) {
    const obj = document.getElementById(id);
    let startTimestamp = null;
    const step = (timestamp) => {
        if (!startTimestamp) startTimestamp = timestamp;
        const progress = Math.min((timestamp - startTimestamp) / duration, 1);
        obj.innerHTML = Math.floor(progress * (end - start) + start);
        if (progress < 1) {
            window.requestAnimationFrame(step);
        }
    };
    window.requestAnimationFrame(step);
}

// Modal Logic
function openRecipeModal() {
    if (!currentRecipe) return;

    const modal = document.getElementById('recipe-modal');
    const content = document.getElementById('modal-content');
    const mdContainer = document.getElementById('markdown-container');

    // Parse Markdown
    mdContainer.innerHTML = marked.parse(currentRecipe.md);

    modal.classList.remove('hidden');
    // Small delay to allow display:block to apply before transform
    setTimeout(() => {
        content.classList.remove('translate-x-full');
    }, 10);
}

function closeRecipeModal() {
    const modal = document.getElementById('recipe-modal');
    const content = document.getElementById('modal-content');

    content.classList.add('translate-x-full');
    
    setTimeout(() => {
        modal.classList.add('hidden');
    }, 300);
}

// Initialize
window.onload = init;

