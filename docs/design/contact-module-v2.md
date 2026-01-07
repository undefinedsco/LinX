# Contact Module V2 Design Specification

## 1. Overview
The Contact module serves as a unified index for three types of entities:
1.  **Solid Friends** (Native `foaf:knows` connections).
2.  **External Contacts** (Imported from WeChat or other platforms).
3.  **AI Agents** (Local or remote assistants).

## 2. Layout & Structure

### 2.1 Contact List Pane (Left)
A unified list structure inspired by WeChat, with modern LobeChat aesthetics.

*   **Header**:
    *   Search Bar (`Input` with icon).
    *   Add Button (`+`).
*   **Fixed Sections** (Top):
    *   **[👤 New Friends]**: Entrance for friend requests and imported strangers.
    *   **[🤖 Smart Assistants]**: Collapsible or dedicated entry for frequently used bots.
*   **Unified A-Z List**:
    *   **Logic**: Humans (Solid/WeChat) and Agents are mixed and sorted alphabetically (A-Z / Pinyin).
    *   **Visual Distinction**:
        *   **Solid**: Standard Avatar.
        *   **WeChat**: Avatar with small WeChat badge.
        *   **Agent**: Avatar with Bot badge.
    *   **Index**: Right-side floating A-Z index bar.

### 2.2 Contact Detail Pane (Right)
A centrally aligned, adaptive profile card.

#### Header Area (Left-Right Layout)
*   **Left**: Large Avatar (`w-20 h-20` to `w-24 h-24`, rounded-xl).
*   **Right** (3 Information Rows):
    1.  **Name Row**: Display Name + Gender Icon (🚹/🚺/🤖) + Star (⭐).
    2.  **ID Row**: `WeChat ID: xxx` or `WebID: alice.pod...`.
    3.  **Region Row**: `Region: Beijing, CN`.
*   **Top-Right Actions**:
    *   **Context Menu**: [Edit], [Delete], [Share].
    *   **Solid Only**: [🔄 Refresh Profile] (Sync with Pod).

#### Action Bar
Horizontal pill buttons below the header:
*   **[ 💬 Chat ]** (Primary)
*   **[ 📞 Voice Call ]**
*   **[ 📹 Video Call ]**

#### Content Area (Adaptive)
Content cards vary based on contact type:

**A. Human (Solid / WeChat)**
*   **Information Card**:
    *   **Alias/Note**: Editable remark.
    *   **Tags**: Grouping tags.
*   **Social Graph** (Solid Only):
    *   Link to public profile.

**B. AI Agent**
*   **Core Configuration**:
    *   **System Prompt**: Preview of the prompt (first 3 lines) + [Edit] button (opens modal).
    *   **LLM Model**: Dropdown (e.g., `GPT-4`, `Claude 3.5`).
*   **Multimodal Configuration**:
    *   **TTS Model**: Dropdown (e.g., `OpenAI TTS`, `ElevenLabs`).
    *   **Video Model**: Dropdown (e.g., `HeyGen`, `SadTalker`).
*   **Capabilities**:
    *   **MCP / Tools**: List of enabled tools + [Configure] button.

## 3. Data Model Requirements
*To be implemented in `packages/models` schema.*

*   **Common Fields** (`contactTable`):
    *   `gender`: `male` | `female` | `bot` | `unknown`.
    *   `region`: String (e.g., "China", "US").
*   **Agent Fields** (`agentTable`):
    *   `ttsModel`: String (ID of the TTS provider/model).
    *   `videoModel`: String (ID of the video provider/model).
    *   `tools`: JSON/Array (List of enabled MCP tools).
