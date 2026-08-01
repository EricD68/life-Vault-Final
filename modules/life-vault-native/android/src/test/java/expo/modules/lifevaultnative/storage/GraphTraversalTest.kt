package expo.modules.lifevaultnative.storage

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class GraphTraversalTest {
    private val types = mapOf(
        "guidance" to "project",
        "speechme" to "project",
        "guidance-paddle" to "account",
        "speechme-paddle" to "account",
        "paddle" to "platform",
        "guidance-product" to "resource",
    )

    private val adjacency = mapOf(
        "guidance" to setOf("guidance-paddle", "guidance-product"),
        "guidance-paddle" to setOf("guidance", "paddle", "guidance-product"),
        "guidance-product" to setOf("guidance", "guidance-paddle"),
        "paddle" to setOf("guidance-paddle", "speechme-paddle"),
        "speechme-paddle" to setOf("paddle", "speechme"),
        "speechme" to setOf("speechme-paddle"),
    )

    @Test
    fun projectSearchStopsAtSharedPlatformBoundary() {
        val result = GraphTraversal.scopedDepths("guidance", 3, adjacency, types)
        assertTrue(result.containsKey("guidance-paddle"))
        assertTrue(result.containsKey("guidance-product"))
        assertTrue(result.containsKey("paddle"))
        assertFalse(result.containsKey("speechme-paddle"))
        assertFalse(result.containsKey("speechme"))
    }

    @Test
    fun platformSearchCanShowItsAccountsAndProjects() {
        val result = GraphTraversal.scopedDepths("paddle", 3, adjacency, types)
        assertTrue(result.containsKey("guidance-paddle"))
        assertTrue(result.containsKey("speechme-paddle"))
        assertTrue(result.containsKey("guidance"))
        assertTrue(result.containsKey("speechme"))
    }

    @Test
    fun accountSearchShowsItsOwnProjectAndPlatformOnly() {
        val result = GraphTraversal.scopedDepths("guidance-paddle", 3, adjacency, types)
        assertTrue(result.containsKey("guidance"))
        assertTrue(result.containsKey("paddle"))
        assertFalse(result.containsKey("speechme-paddle"))
    }
}
