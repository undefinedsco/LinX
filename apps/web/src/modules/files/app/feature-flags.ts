/**
 * Files module feature flags
 *
 * CP2: Default cutover - flag enabled.
 * Rollback: set back to false to restore CP0 placeholder behavior.
 */

/** Enable CP1 files browsing features (FilesTreePane, FilesListPane, FileDetailPane). */
export const FILES_CP1_ENABLED = true // CP2: default on

/** R6 K0: the tree lists folders and data tables only; other files are reached through their folder's table. */
export const FILES_TREE_FOLDERS_AND_TABLES_ONLY = true
