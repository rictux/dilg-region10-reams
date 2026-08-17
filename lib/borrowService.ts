import { supabase } from './supabase';

export interface BorrowableItem {
  item_id: number;
  item_code: string;
  item_name: string;
  item_description?: string;
  item_category?: string;
  status: 'Available' | 'Damaged' | 'Archived';
  created_at: string;
}

export interface BorrowRecord {
  borrow_id: number;
  event_id: number;
  participant_id: number;
  item_id: number;
  borrowed_at: string;
  returned_at?: string;
  returned_by_participant_id?: number;
  scanner_device?: string;
  notes?: string;
  created_at: string;
}

export interface ActiveBorrow {
  borrow_id: number;
  item_id: number;
  item_name: string;
  item_code: string;
  borrowed_at: string;
}

export interface BorrowHistory {
  borrow_id: number;
  participant_id: number;
  participant_name: string;
  item_id: number;
  item_name: string;
  borrowed_at: string;
  returned_at?: string;
  duration_minutes: number;
  status: 'Unreturned' | 'Returned';
}

export interface ParticipantBorrowHistory {
  borrow_id: number;
  item_id: number;
  item_name: string;
  item_code: string;
  borrowed_at: string;
  returned_at?: string;
  duration_minutes: number;
  status: 'Unreturned' | 'Returned';
}

export const borrowService = {
  // ==================== Item Lookup ====================

  /**
   * Lookup item by QR code (item_code) for a specific office
   */
  async getItemByCode(itemCode: string, officeId: number): Promise<BorrowableItem | null> {
    const { data, error } = await supabase
      .from('borrowable_items')
      .select('*')
      .eq('item_code', itemCode.trim())
      .eq('office_id', officeId)
      .eq('status', 'Available')
      .single();

    if (error) {
      console.error('Error fetching item by code:', error);
      return null;
    }

    return data;
  },

  /**
   * Get all available items for an office
   */
  async getAvailableItems(officeId: number): Promise<BorrowableItem[]> {
    const { data, error } = await supabase
      .from('borrowable_items')
      .select('*')
      .eq('office_id', officeId)
      .eq('status', 'Available')
      .order('item_name', { ascending: true });

    if (error) {
      console.error('Error fetching available items:', error);
      return [];
    }

    return data || [];
  },

  /**
   * Get all items (including damaged/archived) for an office
   */
  async getAllItems(officeId: number): Promise<BorrowableItem[]> {
    const { data, error } = await supabase
      .from('borrowable_items')
      .select('*')
      .eq('office_id', officeId)
      .order('item_name', { ascending: true });

    if (error) {
      console.error('Error fetching all items:', error);
      return [];
    }

    return data || [];
  },

  // ==================== Item Management ====================

  /**
   * Create a new borrowable item for an office
   */
  async createItem(
    officeId: number,
    itemCode: string,
    itemName: string,
    itemDescription?: string,
    itemCategory?: string
  ): Promise<BorrowableItem | null> {
    const { data, error } = await supabase
      .from('borrowable_items')
      .insert({
        office_id: officeId,
        item_code: itemCode.trim(),
        item_name: itemName.trim(),
        item_description: itemDescription?.trim(),
        item_category: itemCategory?.trim(),
        status: 'Available',
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating item:', error);
      return null;
    }

    return data;
  },

  /**
   * Update item details
   */
  async updateItem(
    itemId: number,
    updates: Partial<BorrowableItem>
  ): Promise<BorrowableItem | null> {
    const { data, error } = await supabase
      .from('borrowable_items')
      .update(updates)
      .eq('item_id', itemId)
      .select()
      .single();

    if (error) {
      console.error('Error updating item:', error);
      return null;
    }

    return data;
  },

  /**
   * Mark item as damaged
   */
  async markItemDamaged(itemId: number): Promise<BorrowableItem | null> {
    return this.updateItem(itemId, { status: 'Damaged' });
  },

  /**
   * Archive an item
   */
  async archiveItem(itemId: number): Promise<BorrowableItem | null> {
    return this.updateItem(itemId, { status: 'Archived' });
  },

  // ==================== Borrow Operations ====================

  /**
   * Create a borrow record (participant borrows an item)
   */
  async borrowItem(
    eventId: number,
    participantId: number,
    itemId: number,
    scannerDevice?: string
  ): Promise<BorrowRecord | null> {
    const { data, error } = await supabase
      .rpc('create_borrow', {
        p_event_id: eventId,
        p_participant_id: participantId,
        p_item_id: itemId,
        p_scanner_device: scannerDevice,
      });

    if (error) {
      console.error('Error creating borrow record:', error);
      return null;
    }

    return data as BorrowRecord;
  },

  /**
   * Return a borrowed item
   */
  async returnItem(
    borrowId: number,
    returnedByParticipantId: number,
    scannerDevice?: string,
    notes?: string
  ): Promise<BorrowRecord | null> {
    const { data, error } = await supabase
      .rpc('return_borrow', {
        p_borrow_id: borrowId,
        p_returned_by_participant_id: returnedByParticipantId,
        p_scanner_device: scannerDevice,
        p_notes: notes,
      });

    if (error) {
      console.error('Error returning item:', error);
      return null;
    }

    return data as BorrowRecord;
  },

  // ==================== Query Operations ====================

  /**
   * Get active (unreturned) borrows for a participant in an event
   */
  async getActiveBorrows(
    participantId: number,
    eventId: number
  ): Promise<ActiveBorrow[]> {
    const { data, error } = await supabase
      .rpc('get_active_borrows', {
        p_participant_id: participantId,
        p_event_id: eventId,
      });

    if (error) {
      console.error('Error fetching active borrows:', error);
      return [];
    }

    return data || [];
  },

  /**
   * Event ids that have at least one borrow recorded against them.
   * Lets the history page offer only events that have something to show,
   * rather than every event the user can reach.
   */
  async getEventIdsWithBorrows(): Promise<number[]> {
    const { data, error } = await supabase
      .from('borrowed_items')
      .select('event_id');

    if (error) {
      console.error('Error fetching events with borrows:', error);
      throw error;
    }

    return Array.from(
      new Set((data || []).map((row: { event_id: number }) => Number(row.event_id)))
    ).filter((id) => Number.isSafeInteger(id) && id > 0);
  },

  /**
   * Get full borrow history for an event.
   * Throws rather than returning [] — a missing RPC or a permissions failure is
   * indistinguishable from "nothing borrowed yet" once it is swallowed, and that
   * is the one thing the history page must not get wrong.
   */
  async getBorrowHistory(eventId: number): Promise<BorrowHistory[]> {
    const { data, error } = await supabase
      .rpc('get_borrow_history', {
        p_event_id: eventId,
      });

    if (error) {
      console.error('Error fetching borrow history:', error);
      throw error;
    }

    return data || [];
  },

  /**
   * Get borrow history for a specific participant in an event
   */
  async getParticipantBorrowHistory(
    participantId: number,
    eventId: number
  ): Promise<ParticipantBorrowHistory[]> {
    const { data, error } = await supabase
      .rpc('get_participant_borrow_history', {
        p_participant_id: participantId,
        p_event_id: eventId,
      });

    if (error) {
      console.error('Error fetching participant borrow history:', error);
      return [];
    }

    return data || [];
  },

  /**
   * Find a borrow record by ID
   */
  async getBorrowById(borrowId: number): Promise<BorrowRecord | null> {
    const { data, error } = await supabase
      .from('borrowed_items')
      .select('*')
      .eq('borrow_id', borrowId)
      .single();

    if (error) {
      console.error('Error fetching borrow record:', error);
      return null;
    }

    return data;
  },

  /**
   * Get all unreturned items for an event (admin view)
   */
  async getUnreturnedItems(eventId: number): Promise<BorrowHistory[]> {
    const history = await this.getBorrowHistory(eventId);
    return history.filter((h) => h.status === 'Unreturned');
  },
};
