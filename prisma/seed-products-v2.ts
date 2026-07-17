import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

interface ProductTemplate {
  name: string;
  description: string;
  price: number;
  comparePrice?: number;
  stock: number;
  imageUrls: string[];
  badge?: "SALE" | "BEST_SELLER" | "NEW";
}

const productsByCategory: Record<string, ProductTemplate[]> = {
  "home-and-kitchen": [
    {
      name: "Stainless Steel Cookware Set",
      description: "Professional 10-piece cookware set with non-stick coating. Oven safe up to 350°F. Heat resistant handles.",
      price: 89.99,
      comparePrice: 129.99,
      stock: 25,
      imageUrls: [
        "https://images.unsplash.com/photo-1610701596007-11502861dcfa?w=800&q=80",
        "https://images.unsplash.com/photo-1578500494198-246f612d03b3?w=800&q=80",
        "https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=800&q=80",
      ],
      badge: "SALE",
    },
    {
      name: "Digital Kitchen Scale",
      description: "Precision digital scale with LCD display. Measures up to 5kg. Great for baking and cooking.",
      price: 24.99,
      stock: 45,
      imageUrls: [
        "https://images.unsplash.com/photo-1584568694244-14fbdf83bd30?w=800&q=80",
        "https://images.unsplash.com/photo-1599599810694-b5ac4dd69371?w=800&q=80",
      ],
    },
    {
      name: "Chef Knife 8-inch",
      description: "German stainless steel chef knife. Sharp blade, ergonomic handle. Professional grade.",
      price: 34.99,
      comparePrice: 49.99,
      stock: 35,
      imageUrls: [
        "https://images.unsplash.com/photo-1593618998160-e34014e67546?w=800&q=80",
        "https://images.unsplash.com/photo-1610701596007-11502861dcfa?w=800&q=80",
        "https://images.unsplash.com/photo-1578500494198-246f612d03b3?w=800&q=80",
      ],
      badge: "BEST_SELLER",
    },
    {
      name: "Glass Food Storage Containers",
      description: "Set of 6 glass containers with airtight lids. Microwave and dishwasher safe. Various sizes.",
      price: 29.99,
      stock: 40,
      imageUrls: [
        "https://images.unsplash.com/photo-1591081351946-39d1d8ebc724?w=800&q=80",
        "https://images.unsplash.com/photo-1584568694244-14fbdf83bd30?w=800&q=80",
      ],
    },
    {
      name: "Bamboo Cutting Board Set",
      description: "Set of 3 eco-friendly bamboo cutting boards. Different sizes for meat and vegetables.",
      price: 22.99,
      stock: 50,
      imageUrls: [
        "https://images.unsplash.com/photo-1577003832154-a7d0b5e5b4b1?w=800&q=80",
        "https://images.unsplash.com/photo-1578500494198-246f612d03b3?w=800&q=80",
      ],
    },
    {
      name: "Silicone Measuring Cups",
      description: "Set of 4 measuring cups with metric and imperial markings. Collapsible design.",
      price: 12.99,
      stock: 60,
      imageUrls: [
        "https://images.unsplash.com/photo-1585516160749-963b7f7e71e2?w=800&q=80",
        "https://images.unsplash.com/photo-1599599810694-b5ac4dd69371?w=800&q=80",
      ],
    },
    {
      name: "Stainless Steel Mixing Bowls",
      description: "Set of 5 mixing bowls with non-slip bases. Perfect for preparation and storage.",
      price: 19.99,
      stock: 55,
      imageUrls: [
        "https://images.unsplash.com/photo-1590509904352-1d32e12d7d91?w=800&q=80",
        "https://images.unsplash.com/photo-1578500494198-246f612d03b3?w=800&q=80",
      ],
    },
    {
      name: "Microwave Safe Lunch Box",
      description: "Compartmentalized lunch container. BPA-free plastic. Perfect for meal prep.",
      price: 14.99,
      stock: 70,
      imageUrls: [
        "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=800&q=80",
        "https://images.unsplash.com/photo-1599599810694-b5ac4dd69371?w=800&q=80",
      ],
    },
    {
      name: "Wooden Spoon Set",
      description: "Set of 6 wooden cooking utensils. Heat resistant and durable.",
      price: 9.99,
      stock: 80,
      imageUrls: [
        "https://images.unsplash.com/photo-1578500494198-246f612d03b3?w=800&q=80",
        "https://images.unsplash.com/photo-1590509904352-1d32e12d7d91?w=800&q=80",
      ],
    },
    {
      name: "Tea Kettle Stainless Steel",
      description: "3-quart capacity. Fast boiling. Whistle alert when ready.",
      price: 27.99,
      stock: 30,
      imageUrls: [
        "https://images.unsplash.com/photo-1563189557-d63cb92d996b?w=800&q=80",
        "https://images.unsplash.com/photo-1610701596007-11502861dcfa?w=800&q=80",
      ],
    },
    {
      name: "Salad Spinner",
      description: "Quick dry your salads and vegetables. Space-saving design.",
      price: 16.99,
      stock: 45,
      imageUrls: [
        "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=800&q=80",
        "https://images.unsplash.com/photo-1599599810694-b5ac4dd69371?w=800&q=80",
      ],
    },
    {
      name: "Can Opener Electric",
      description: "Automatic can opener. Works with any size can. Hands-free operation.",
      price: 19.99,
      stock: 35,
      imageUrls: [
        "https://images.unsplash.com/photo-1599599810694-b5ac4dd69371?w=800&q=80",
        "https://images.unsplash.com/photo-1578500494198-246f612d03b3?w=800&q=80",
      ],
    },
    {
      name: "Pasta Making Maker",
      description: "Stainless steel pasta maker. Make fresh pasta at home easily.",
      price: 39.99,
      comparePrice: 59.99,
      stock: 20,
      imageUrls: [
        "https://images.unsplash.com/photo-1621996346565-e3dbc646d9a9?w=800&q=80",
        "https://images.unsplash.com/photo-1578500494198-246f612d03b3?w=800&q=80",
      ],
      badge: "NEW",
    },
    {
      name: "Coffee Grinder Burr",
      description: "Consistent grind size for perfect coffee. 15 settings.",
      price: 44.99,
      comparePrice: 69.99,
      stock: 25,
      imageUrls: [
        "https://images.unsplash.com/photo-1571115564919-a0e1e1e2e8e5?w=800&q=80",
        "https://images.unsplash.com/photo-1610701596007-11502861dcfa?w=800&q=80",
      ],
      badge: "BEST_SELLER",
    },
    {
      name: "Meat Thermometer Digital",
      description: "Instant read thermometer. Perfect for grilling and cooking. Waterproof.",
      price: 18.99,
      stock: 50,
      imageUrls: [
        "https://images.unsplash.com/photo-1586010007235-7d4e5379b7d0?w=800&q=80",
        "https://images.unsplash.com/photo-1599599810694-b5ac4dd69371?w=800&q=80",
      ],
    },
  ],
  "cleaning-supplies": [
    {
      name: "Microfiber Cleaning Cloth Set",
      description: "Pack of 12 microfiber cloths. Lint-free and ultra-absorbent. Reusable.",
      price: 14.99,
      stock: 100,
      imageUrls: [
        "https://images.unsplash.com/photo-1563893113759-f3dd8b09cc2f?w=800&q=80",
        "https://images.unsplash.com/photo-1584268545671-c90de20786ce?w=800&q=80",
      ],
    },
    {
      name: "All-Purpose Cleaner Spray",
      description: "Eco-friendly cleaning spray. Removes 99.9% of bacteria. 32 oz bottle.",
      price: 8.99,
      stock: 150,
      imageUrls: [
        "https://images.unsplash.com/photo-1584268545671-c90de20786ce?w=800&q=80",
        "https://images.unsplash.com/photo-1563893113759-f3dd8b09cc2f?w=800&q=80",
      ],
    },
    {
      name: "Toilet Brush with Holder",
      description: "Ergonomic design. Durable bristles. Elegant holder.",
      price: 11.99,
      stock: 80,
      imageUrls: [
        "https://images.unsplash.com/photo-1563893113759-f3dd8b09cc2f?w=800&q=80",
        "https://images.unsplash.com/photo-1584268545671-c90de20786ce?w=800&q=80",
      ],
    },
    {
      name: "Mop and Bucket Set",
      description: "Spin mop system with 2 microfiber pads. Easy to use. Great for floors.",
      price: 39.99,
      comparePrice: 59.99,
      stock: 30,
      imageUrls: [
        "https://images.unsplash.com/photo-1563293026-ef19c329f43e?w=800&q=80",
        "https://images.unsplash.com/photo-1584268545671-c90de20786ce?w=800&q=80",
      ],
      badge: "SALE",
    },
    {
      name: "Broom and Dustpan Set",
      description: "Lightweight and durable. Anti-static bristles. Modern design.",
      price: 12.99,
      stock: 70,
      imageUrls: [
        "https://images.unsplash.com/photo-1584268545671-c90de20786ce?w=800&q=80",
        "https://images.unsplash.com/photo-1563893113759-f3dd8b09cc2f?w=800&q=80",
      ],
    },
    {
      name: "Disinfectant Wipes",
      description: "Pack of 200 disinfectant wipes. Kills 99.99% of germs.",
      price: 9.99,
      stock: 200,
      imageUrls: [
        "https://images.unsplash.com/photo-1584268545671-c90de20786ce?w=800&q=80",
        "https://images.unsplash.com/photo-1563893113759-f3dd8b09cc2f?w=800&q=80",
      ],
    },
    {
      name: "Window Cleaner Concentrate",
      description: "Makes 5 gallons of cleaner. Streak-free. Ammonia formula.",
      price: 6.99,
      stock: 120,
      imageUrls: [
        "https://images.unsplash.com/photo-1584268545671-c90de20786ce?w=800&q=80",
        "https://images.unsplash.com/photo-1563893113759-f3dd8b09cc2f?w=800&q=80",
      ],
    },
    {
      name: "Rubber Gloves",
      description: "Pack of 3 pairs. Waterproof and durable. Textured grip.",
      price: 7.99,
      stock: 100,
      imageUrls: [
        "https://images.unsplash.com/photo-1584268545671-c90de20786ce?w=800&q=80",
        "https://images.unsplash.com/photo-1563893113759-f3dd8b09cc2f?w=800&q=80",
      ],
    },
    {
      name: "Sponge and Scrubber Pack",
      description: "Pack of 12 kitchen sponges. Effective cleaning and scouring.",
      price: 5.99,
      stock: 150,
      imageUrls: [
        "https://images.unsplash.com/photo-1584268545671-c90de20786ce?w=800&q=80",
        "https://images.unsplash.com/photo-1563893113759-f3dd8b09cc2f?w=800&q=80",
      ],
    },
    {
      name: "Laundry Detergent",
      description: "Concentrated formula. 64 loads. Fresh scent. Hypoallergenic.",
      price: 12.99,
      stock: 80,
      imageUrls: [
        "https://images.unsplash.com/photo-1584268545671-c90de20786ce?w=800&q=80",
        "https://images.unsplash.com/photo-1563893113759-f3dd8b09cc2f?w=800&q=80",
      ],
    },
    {
      name: "Dish Soap Liquid",
      description: "Cut through grease effectively. Gentle on hands. 24 oz bottle.",
      price: 4.99,
      stock: 200,
      imageUrls: [
        "https://images.unsplash.com/photo-1584268545671-c90de20786ce?w=800&q=80",
        "https://images.unsplash.com/photo-1563893113759-f3dd8b09cc2f?w=800&q=80",
      ],
    },
    {
      name: "Bleach Cleaner",
      description: "Powerful disinfectant. Kills mold and mildew. 64 oz jug.",
      price: 5.99,
      stock: 90,
      imageUrls: [
        "https://images.unsplash.com/photo-1584268545671-c90de20786ce?w=800&q=80",
        "https://images.unsplash.com/photo-1563893113759-f3dd8b09cc2f?w=800&q=80",
      ],
    },
    {
      name: "Feather Duster",
      description: "Retractable handle. Reaches high places. Anti-static.",
      price: 8.99,
      stock: 60,
      imageUrls: [
        "https://images.unsplash.com/photo-1584268545671-c90de20786ce?w=800&q=80",
        "https://images.unsplash.com/photo-1563893113759-f3dd8b09cc2f?w=800&q=80",
      ],
    },
    {
      name: "Garbage Bags Roll",
      description: "Pack of 40 bags. 13-gallon capacity. Drawstring closure.",
      price: 9.99,
      stock: 120,
      imageUrls: [
        "https://images.unsplash.com/photo-1584268545671-c90de20786ce?w=800&q=80",
        "https://images.unsplash.com/photo-1563893113759-f3dd8b09cc2f?w=800&q=80",
      ],
    },
    {
      name: "Cloth Refresh Spray",
      description: "Freshens upholstery and fabrics. Odor eliminator. 10 oz spray.",
      price: 7.99,
      stock: 100,
      imageUrls: [
        "https://images.unsplash.com/photo-1584268545671-c90de20786ce?w=800&q=80",
        "https://images.unsplash.com/photo-1563893113759-f3dd8b09cc2f?w=800&q=80",
      ],
    },
  ],
  "tools-and-hardware": [
    {
      name: "Power Drill Cordless",
      description: "18V lithium-ion battery. Includes 30-piece bit set. Perfect for drilling and driving.",
      price: 79.99,
      comparePrice: 119.99,
      stock: 20,
      imageUrls: [
        "https://images.unsplash.com/photo-1572981522632-8ddac2ee6d4a?w=800&q=80",
        "https://images.unsplash.com/photo-1517420879526-29e3b0e60ce6?w=800&q=80",
        "https://images.unsplash.com/photo-1504587773792-42c93e83e4c9?w=800&q=80",
      ],
      badge: "BEST_SELLER",
    },
    {
      name: "Hammer Set",
      description: "3-piece hammer set with different weights. Comfortable handles.",
      price: 19.99,
      stock: 50,
      imageUrls: [
        "https://images.unsplash.com/photo-1517420879526-29e3b0e60ce6?w=800&q=80",
        "https://images.unsplash.com/photo-1504587773792-42c93e83e4c9?w=800&q=80",
      ],
    },
    {
      name: "Screwdriver Set",
      description: "24-piece set with multiple tip types. Ergonomic handles.",
      price: 14.99,
      stock: 70,
      imageUrls: [
        "https://images.unsplash.com/photo-1517420879526-29e3b0e60ce6?w=800&q=80",
        "https://images.unsplash.com/photo-1504587773792-42c93e83e4c9?w=800&q=80",
      ],
    },
    {
      name: "Measuring Tape 25ft",
      description: "Durable steel blade. Locking mechanism. Easy-read markings.",
      price: 12.99,
      stock: 100,
      imageUrls: [
        "https://images.unsplash.com/photo-1517420879526-29e3b0e60ce6?w=800&q=80",
        "https://images.unsplash.com/photo-1504587773792-42c93e83e4c9?w=800&q=80",
      ],
    },
    {
      name: "Carpenter Level",
      description: "24-inch level. Magnetic strip. Bubble vials for accuracy.",
      price: 24.99,
      stock: 40,
      imageUrls: [
        "https://images.unsplash.com/photo-1517420879526-29e3b0e60ce6?w=800&q=80",
        "https://images.unsplash.com/photo-1504587773792-42c93e83e4c9?w=800&q=80",
      ],
    },
    {
      name: "Wrench Set",
      description: "12-piece wrench set. Chrome finished. Fits all standard sizes.",
      price: 29.99,
      stock: 35,
      imageUrls: [
        "https://images.unsplash.com/photo-1517420879526-29e3b0e60ce6?w=800&q=80",
        "https://images.unsplash.com/photo-1504587773792-42c93e83e4c9?w=800&q=80",
      ],
    },
    {
      name: "Plier Set",
      description: "5-piece plier set. Comfortable grips. Essential for any toolbox.",
      price: 18.99,
      stock: 55,
      imageUrls: [
        "https://images.unsplash.com/photo-1517420879526-29e3b0e60ce6?w=800&q=80",
        "https://images.unsplash.com/photo-1504587773792-42c93e83e4c9?w=800&q=80",
      ],
    },
    {
      name: "Cordless Circular Saw",
      description: "4.5-inch blade. 18V battery included. Perfect for cutting wood.",
      price: 89.99,
      comparePrice: 139.99,
      stock: 15,
      imageUrls: [
        "https://images.unsplash.com/photo-1572981522632-8ddac2ee6d4a?w=800&q=80",
        "https://images.unsplash.com/photo-1517420879526-29e3b0e60ce6?w=800&q=80",
      ],
      badge: "SALE",
    },
    {
      name: "Nail Assortment Pack",
      description: "1000 pieces of various nail sizes. Common sizes included.",
      price: 8.99,
      stock: 150,
      imageUrls: [
        "https://images.unsplash.com/photo-1517420879526-29e3b0e60ce6?w=800&q=80",
        "https://images.unsplash.com/photo-1504587773792-42c93e83e4c9?w=800&q=80",
      ],
    },
    {
      name: "Bolt and Screw Set",
      description: "500-piece assortment of bolts and screws. Stainless steel.",
      price: 12.99,
      stock: 100,
      imageUrls: [
        "https://images.unsplash.com/photo-1517420879526-29e3b0e60ce6?w=800&q=80",
        "https://images.unsplash.com/photo-1504587773792-42c93e83e4c9?w=800&q=80",
      ],
    },
    {
      name: "Saw Hand",
      description: "20-inch hand saw. Sharp teeth. Comfortable grip.",
      price: 14.99,
      stock: 60,
      imageUrls: [
        "https://images.unsplash.com/photo-1517420879526-29e3b0e60ce6?w=800&q=80",
        "https://images.unsplash.com/photo-1504587773792-42c93e83e4c9?w=800&q=80",
      ],
    },
    {
      name: "Toolbox Metal",
      description: "Portable metal toolbox. Lockable. Multiple compartments.",
      price: 34.99,
      stock: 30,
      imageUrls: [
        "https://images.unsplash.com/photo-1517420879526-29e3b0e60ce6?w=800&q=80",
        "https://images.unsplash.com/photo-1504587773792-42c93e83e4c9?w=800&q=80",
      ],
    },
    {
      name: "LED Work Light",
      description: "Cordless LED work light. Magnetic base. 500 lumens.",
      price: 22.99,
      stock: 45,
      imageUrls: [
        "https://images.unsplash.com/photo-1517420879526-29e3b0e60ce6?w=800&q=80",
        "https://images.unsplash.com/photo-1565636192335-14c0c3ecd5d8?w=800&q=80",
      ],
      badge: "NEW",
    },
    {
      name: "Safety Glasses",
      description: "Pack of 2 safety glasses. UV protection. Comfortable fit.",
      price: 9.99,
      stock: 120,
      imageUrls: [
        "https://images.unsplash.com/photo-1517420879526-29e3b0e60ce6?w=800&q=80",
        "https://images.unsplash.com/photo-1504587773792-42c93e83e4c9?w=800&q=80",
      ],
    },
    {
      name: "Work Gloves",
      description: "Pack of 3 leather work gloves. Durable and protective.",
      price: 11.99,
      stock: 100,
      imageUrls: [
        "https://images.unsplash.com/photo-1517420879526-29e3b0e60ce6?w=800&q=80",
        "https://images.unsplash.com/photo-1504587773792-42c93e83e4c9?w=800&q=80",
      ],
    },
  ],
  "patio-and-garden": [
    {
      name: "Garden Tool Set",
      description: "4-piece tool set with shovel, rake, hoe, and spade. Comfortable handles.",
      price: 34.99,
      stock: 40,
      imageUrls: [
        "https://images.unsplash.com/photo-1560493676-04071c5f467b?w=800&q=80",
        "https://images.unsplash.com/photo-1559581248-e4699abeada9?w=800&q=80",
        "https://images.unsplash.com/photo-1585516160749-963b7f7e71e2?w=800&q=80",
      ],
    },
    {
      name: "Watering Can",
      description: "2-gallon capacity. Ergonomic handle. Long spout for easy watering.",
      price: 12.99,
      stock: 80,
      imageUrls: [
        "https://images.unsplash.com/photo-1558788353-f76d92427f16?w=800&q=80",
        "https://images.unsplash.com/photo-1560493676-04071c5f467b?w=800&q=80",
      ],
    },
    {
      name: "Garden Hose 50ft",
      description: "Lightweight and durable. Kink-resistant. All-weather material.",
      price: 24.99,
      stock: 50,
      imageUrls: [
        "https://images.unsplash.com/photo-1560493676-04071c5f467b?w=800&q=80",
        "https://images.unsplash.com/photo-1559581248-e4699abeada9?w=800&q=80",
      ],
    },
    {
      name: "Pruning Shears",
      description: "Sharp bypass blades. Ergonomic handles. Perfect for trimming branches.",
      price: 16.99,
      stock: 60,
      imageUrls: [
        "https://images.unsplash.com/photo-1560493676-04071c5f467b?w=800&q=80",
        "https://images.unsplash.com/photo-1585516160749-963b7f7e71e2?w=800&q=80",
      ],
    },
    {
      name: "Potting Soil Bag",
      description: "10-quart bag of potting mix. Nutrient-rich. Great for indoor plants.",
      price: 8.99,
      stock: 100,
      imageUrls: [
        "https://images.unsplash.com/photo-1559581248-e4699abeada9?w=800&q=80",
        "https://images.unsplash.com/photo-1560493676-04071c5f467b?w=800&q=80",
      ],
    },
    {
      name: "Plant Pots Set",
      description: "Set of 6 terra cotta pots. Various sizes. Drainage holes.",
      price: 14.99,
      stock: 70,
      imageUrls: [
        "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800&q=80",
        "https://images.unsplash.com/photo-1560493676-04071c5f467b?w=800&q=80",
      ],
    },
    {
      name: "Garden Gloves",
      description: "Pack of 3 leather garden gloves. Waterproof. Durable.",
      price: 11.99,
      stock: 90,
      imageUrls: [
        "https://images.unsplash.com/photo-1560493676-04071c5f467b?w=800&q=80",
        "https://images.unsplash.com/photo-1559581248-e4699abeada9?w=800&q=80",
      ],
    },
    {
      name: "Lawn Mower Push",
      description: "20-inch push mower. Adjustable cutting heights. Lightweight.",
      price: 199.99,
      comparePrice: 279.99,
      stock: 10,
      imageUrls: [
        "https://images.unsplash.com/photo-1560493676-04071c5f467b?w=800&q=80",
        "https://images.unsplash.com/photo-1585516160749-963b7f7e71e2?w=800&q=80",
      ],
      badge: "BEST_SELLER",
    },
    {
      name: "Garden Kneeler Pad",
      description: "Foam kneeling pad. Waterproof. Easy to transport.",
      price: 19.99,
      stock: 50,
      imageUrls: [
        "https://images.unsplash.com/photo-1560493676-04071c5f467b?w=800&q=80",
        "https://images.unsplash.com/photo-1559581248-e4699abeada9?w=800&q=80",
      ],
    },
    {
      name: "Compost Bin",
      description: "18-gallon capacity. Dual chambers. Great for composting.",
      price: 44.99,
      comparePrice: 59.99,
      stock: 25,
      imageUrls: [
        "https://images.unsplash.com/photo-1560493676-04071c5f467b?w=800&q=80",
        "https://images.unsplash.com/photo-1559581248-e4699abeada9?w=800&q=80",
      ],
      badge: "NEW",
    },
    {
      name: "Outdoor Cushions Set",
      description: "Set of 4 outdoor cushions. Weather-resistant. Colorful patterns.",
      price: 39.99,
      comparePrice: 54.99,
      stock: 30,
      imageUrls: [
        "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800&q=80",
        "https://images.unsplash.com/photo-1560493676-04071c5f467b?w=800&q=80",
      ],
      badge: "SALE",
    },
    {
      name: "Bird House",
      description: "Wooden birdhouse. Easy mounting. Great for attracting birds.",
      price: 18.99,
      stock: 40,
      imageUrls: [
        "https://images.unsplash.com/photo-1560493676-04071c5f467b?w=800&q=80",
        "https://images.unsplash.com/photo-1559581248-e4699abeada9?w=800&q=80",
      ],
    },
    {
      name: "Landscape Fabric",
      description: "100 sq ft roll. Prevents weed growth. UV resistant.",
      price: 21.99,
      stock: 45,
      imageUrls: [
        "https://images.unsplash.com/photo-1560493676-04071c5f467b?w=800&q=80",
        "https://images.unsplash.com/photo-1559581248-e4699abeada9?w=800&q=80",
      ],
    },
    {
      name: "Fertilizer Bag",
      description: "10-lb bag of all-purpose fertilizer. Great for gardens.",
      price: 12.99,
      stock: 100,
      imageUrls: [
        "https://images.unsplash.com/photo-1560493676-04071c5f467b?w=800&q=80",
        "https://images.unsplash.com/photo-1559581248-e4699abeada9?w=800&q=80",
      ],
    },
    {
      name: "Hedge Trimmer Electric",
      description: "20-inch blade. Cordless. 18V battery included.",
      price: 69.99,
      comparePrice: 99.99,
      stock: 20,
      imageUrls: [
        "https://images.unsplash.com/photo-1560493676-04071c5f467b?w=800&q=80",
        "https://images.unsplash.com/photo-1585516160749-963b7f7e71e2?w=800&q=80",
      ],
      badge: "SALE",
    },
  ],
  "pet-supplies": [
    {
      name: "Dog Food Premium",
      description: "Nutritionally balanced formula. 30-lb bag. Chicken and rice.",
      price: 49.99,
      stock: 50,
      imageUrls: [
        "https://images.unsplash.com/photo-1587300003388-59208cc962cb?w=800&q=80",
        "https://images.unsplash.com/photo-1608043152269-423dbba4e7e1?w=800&q=80",
      ],
    },
    {
      name: "Cat Litter Box",
      description: "Large covered litter box. Includes scoop. Odor control.",
      price: 34.99,
      stock: 40,
      imageUrls: [
        "https://images.unsplash.com/photo-1558788353-f76d92427f16?w=800&q=80",
        "https://images.unsplash.com/photo-1587300003388-59208cc962cb?w=800&q=80",
      ],
    },
    {
      name: "Pet Toys Ball Set",
      description: "Pack of 6 colorful toy balls. Great for dogs and cats.",
      price: 9.99,
      stock: 100,
      imageUrls: [
        "https://images.unsplash.com/photo-1587300003388-59208cc962cb?w=800&q=80",
        "https://images.unsplash.com/photo-1608043152269-423dbba4e7e1?w=800&q=80",
      ],
    },
    {
      name: "Dog Leash Adjustable",
      description: "6-foot retractable leash. Comfortable grip. Heavy-duty.",
      price: 16.99,
      stock: 70,
      imageUrls: [
        "https://images.unsplash.com/photo-1587300003388-59208cc962cb?w=800&q=80",
        "https://images.unsplash.com/photo-1608043152269-423dbba4e7e1?w=800&q=80",
      ],
    },
    {
      name: "Pet Water Fountain",
      description: "Automatic water fountain. Filters included. 2.5L capacity.",
      price: 39.99,
      comparePrice: 54.99,
      stock: 30,
      imageUrls: [
        "https://images.unsplash.com/photo-1587300003388-59208cc962cb?w=800&q=80",
        "https://images.unsplash.com/photo-1608043152269-423dbba4e7e1?w=800&q=80",
      ],
      badge: "BEST_SELLER",
    },
    {
      name: "Pet Bed Orthopedic",
      description: "Memory foam pet bed. Washable cover. Perfect comfort for pets.",
      price: 54.99,
      comparePrice: 79.99,
      stock: 25,
      imageUrls: [
        "https://images.unsplash.com/photo-1587300003388-59208cc962cb?w=800&q=80",
        "https://images.unsplash.com/photo-1608043152269-423dbba4e7e1?w=800&q=80",
      ],
      badge: "SALE",
    },
    {
      name: "Dog Training Treats",
      description: "Low-calorie training treats. Chicken flavor. 200-ct box.",
      price: 8.99,
      stock: 150,
      imageUrls: [
        "https://images.unsplash.com/photo-1587300003388-59208cc962cb?w=800&q=80",
        "https://images.unsplash.com/photo-1608043152269-423dbba4e7e1?w=800&q=80",
      ],
    },
    {
      name: "Cat Scratch Post",
      description: "Tall scratching post. Sisal rope. Stable base.",
      price: 29.99,
      stock: 35,
      imageUrls: [
        "https://images.unsplash.com/photo-1558788353-f76d92427f16?w=800&q=80",
        "https://images.unsplash.com/photo-1587300003388-59208cc962cb?w=800&q=80",
      ],
    },
    {
      name: "Pet Grooming Brush",
      description: "Slicker brush for dogs and cats. Removes loose hair.",
      price: 14.99,
      stock: 80,
      imageUrls: [
        "https://images.unsplash.com/photo-1587300003388-59208cc962cb?w=800&q=80",
        "https://images.unsplash.com/photo-1608043152269-423dbba4e7e1?w=800&q=80",
      ],
    },
    {
      name: "Dog Crate Collapsible",
      description: "Portable collapsible crate. Easy to carry. Ventilated.",
      price: 44.99,
      stock: 40,
      imageUrls: [
        "https://images.unsplash.com/photo-1587300003388-59208cc962cb?w=800&q=80",
        "https://images.unsplash.com/photo-1608043152269-423dbba4e7e1?w=800&q=80",
      ],
    },
    {
      name: "Cat Harness Adjustable",
      description: "Comfortable harness with leash. Reflective strips.",
      price: 12.99,
      stock: 90,
      imageUrls: [
        "https://images.unsplash.com/photo-1558788353-f76d92427f16?w=800&q=80",
        "https://images.unsplash.com/photo-1587300003388-59208cc962cb?w=800&q=80",
      ],
    },
    {
      name: "Pet ID Tag",
      description: "Pack of 2 personalized ID tags. Engraving included.",
      price: 6.99,
      stock: 200,
      imageUrls: [
        "https://images.unsplash.com/photo-1587300003388-59208cc962cb?w=800&q=80",
        "https://images.unsplash.com/photo-1608043152269-423dbba4e7e1?w=800&q=80",
      ],
    },
    {
      name: "Dog Raincoat",
      description: "Waterproof raincoat for dogs. Adjustable fit. All sizes.",
      price: 19.99,
      stock: 50,
      imageUrls: [
        "https://images.unsplash.com/photo-1587300003388-59208cc962cb?w=800&q=80",
        "https://images.unsplash.com/photo-1608043152269-423dbba4e7e1?w=800&q=80",
      ],
      badge: "NEW",
    },
    {
      name: "Catnip Toys Bundle",
      description: "Pack of 8 catnip toys. Interactive and entertaining.",
      price: 7.99,
      stock: 120,
      imageUrls: [
        "https://images.unsplash.com/photo-1558788353-f76d92427f16?w=800&q=80",
        "https://images.unsplash.com/photo-1587300003388-59208cc962cb?w=800&q=80",
      ],
    },
    {
      name: "Pet Waste Bags",
      description: "1000-count roll of waste bags. Biodegradable. Dispenser included.",
      price: 11.99,
      stock: 100,
      imageUrls: [
        "https://images.unsplash.com/photo-1587300003388-59208cc962cb?w=800&q=80",
        "https://images.unsplash.com/photo-1608043152269-423dbba4e7e1?w=800&q=80",
      ],
    },
  ],
  "toys": [
    {
      name: "Building Blocks Set",
      description: "1000-piece building block set. Compatible with major brands.",
      price: 34.99,
      stock: 45,
      imageUrls: [
        "https://images.unsplash.com/photo-1565040666747-69f6646db940?w=800&q=80",
        "https://images.unsplash.com/photo-1593642632823-8f785ba67e45?w=800&q=80",
      ],
    },
    {
      name: "Toy Action Figures",
      description: "Set of 10 action figures. Collectible. Great for kids.",
      price: 19.99,
      stock: 60,
      imageUrls: [
        "https://images.unsplash.com/photo-1595433707802-6b2626ef1c91?w=800&q=80",
        "https://images.unsplash.com/photo-1565040666747-69f6646db940?w=800&q=80",
      ],
    },
    {
      name: "Puzzle 1000 Piece",
      description: "1000-piece jigsaw puzzle. High-quality pieces. Beautiful scene.",
      price: 12.99,
      stock: 80,
      imageUrls: [
        "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800&q=80",
        "https://images.unsplash.com/photo-1593642632823-8f785ba67e45?w=800&q=80",
      ],
    },
    {
      name: "Board Game Collection",
      description: "Set of 3 classic board games. Family-friendly. Fun for all ages.",
      price: 24.99,
      stock: 50,
      imageUrls: [
        "https://images.unsplash.com/photo-1516975080664-ed2fc6a32937?w=800&q=80",
        "https://images.unsplash.com/photo-1593642632823-8f785ba67e45?w=800&q=80",
      ],
    },
    {
      name: "Remote Control Car",
      description: "High-speed RC car. 4WD. 25mph speed. Rechargeable battery.",
      price: 49.99,
      comparePrice: 74.99,
      stock: 35,
      imageUrls: [
        "https://images.unsplash.com/photo-1593642632823-8f785ba67e45?w=800&q=80",
        "https://images.unsplash.com/photo-1565040666747-69f6646db940?w=800&q=80",
      ],
      badge: "BEST_SELLER",
    },
    {
      name: "Drone Mini Camera",
      description: "Foldable drone with 1080p camera. Long flight time. Beginner-friendly.",
      price: 79.99,
      comparePrice: 119.99,
      stock: 25,
      imageUrls: [
        "https://images.unsplash.com/photo-1561070791-2526d30994b5?w=800&q=80",
        "https://images.unsplash.com/photo-1593642632823-8f785ba67e45?w=800&q=80",
      ],
      badge: "SALE",
    },
    {
      name: "Bicycle Kid 20 inch",
      description: "Kids bicycle with training wheels. 20-inch wheels. Colorful design.",
      price: 94.99,
      comparePrice: 129.99,
      stock: 20,
      imageUrls: [
        "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800&q=80",
        "https://images.unsplash.com/photo-1565040666747-69f6646db940?w=800&q=80",
      ],
      badge: "SALE",
    },
    {
      name: "Yo-Yo Pro",
      description: "Professional yo-yo for tricks. Ball bearing design. Durable.",
      price: 8.99,
      stock: 150,
      imageUrls: [
        "https://images.unsplash.com/photo-1595433707802-6b2626ef1c91?w=800&q=80",
        "https://images.unsplash.com/photo-1593642632823-8f785ba67e45?w=800&q=80",
      ],
    },
    {
      name: "Skateboard Beginner",
      description: "7-ply maple deck. Smooth wheels. Great for beginners.",
      price: 39.99,
      stock: 40,
      imageUrls: [
        "https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=800&q=80",
        "https://images.unsplash.com/photo-1565040666747-69f6646db940?w=800&q=80",
      ],
    },
    {
      name: "Roller Skates Kids",
      description: "Adjustable size roller skates. Lights in wheels. All protective gear included.",
      price: 44.99,
      comparePrice: 64.99,
      stock: 30,
      imageUrls: [
        "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800&q=80",
        "https://images.unsplash.com/photo-1565040666747-69f6646db940?w=800&q=80",
      ],
      badge: "NEW",
    },
    {
      name: "Telescope Beginner",
      description: "40mm aperture telescope. Perfect for stargazing. Includes eyepieces.",
      price: 59.99,
      comparePrice: 84.99,
      stock: 20,
      imageUrls: [
        "https://images.unsplash.com/photo-1444080748397-f442aa95c3e5?w=800&q=80",
        "https://images.unsplash.com/photo-1593642632823-8f785ba67e45?w=800&q=80",
      ],
      badge: "NEW",
    },
    {
      name: "Art Supply Set",
      description: "150-piece art set. Markers, colored pencils, crayons. Everything included.",
      price: 19.99,
      stock: 70,
      imageUrls: [
        "https://images.unsplash.com/photo-1513364776144-60967b0f800f?w=800&q=80",
        "https://images.unsplash.com/photo-1593642632823-8f785ba67e45?w=800&q=80",
      ],
    },
    {
      name: "Musical Instrument Ukulele",
      description: "21-inch soprano ukulele. Great for beginners. Comes with tuner.",
      price: 29.99,
      stock: 40,
      imageUrls: [
        "https://images.unsplash.com/photo-1510915360826-d53c537394fa?w=800&q=80",
        "https://images.unsplash.com/photo-1595433707802-6b2626ef1c91?w=800&q=80",
      ],
    },
    {
      name: "Science Kit STEM",
      description: "STEM science kit with 20 experiments. Educational and fun.",
      price: 24.99,
      stock: 50,
      imageUrls: [
        "https://images.unsplash.com/photo-1516975080664-ed2fc6a32937?w=800&q=80",
        "https://images.unsplash.com/photo-1593642632823-8f785ba67e45?w=800&q=80",
      ],
    },
    {
      name: "Stuffed Animals Pack",
      description: "Pack of 8 soft stuffed animals. Cuddly and safe for kids.",
      price: 14.99,
      stock: 100,
      imageUrls: [
        "https://images.unsplash.com/photo-1595433707802-6b2626ef1c91?w=800&q=80",
        "https://images.unsplash.com/photo-1565040666747-69f6646db940?w=800&q=80",
      ],
    },
  ],
  "general-merchandise": [
    {
      name: "Phone Case Protection",
      description: "Protective phone case. Shockproof. Available for most models.",
      price: 12.99,
      stock: 200,
      imageUrls: [
        "https://images.unsplash.com/photo-1569163139394-de4798aa62b2?w=800&q=80",
        "https://images.unsplash.com/photo-1625948515291-69613efd103f?w=800&q=80",
      ],
    },
    {
      name: "USB-C Cable 6ft",
      description: "Fast charging USB-C cable. Durable. 6-foot length.",
      price: 8.99,
      stock: 150,
      imageUrls: [
        "https://images.unsplash.com/photo-1625948515291-69613efd103f?w=800&q=80",
        "https://images.unsplash.com/photo-1569163139394-de4798aa62b2?w=800&q=80",
      ],
    },
    {
      name: "Wireless Charger Pad",
      description: "Fast wireless charging pad. Non-slip surface. LED indicator.",
      price: 16.99,
      stock: 100,
      imageUrls: [
        "https://images.unsplash.com/photo-1625948515291-69613efd103f?w=800&q=80",
        "https://images.unsplash.com/photo-1569163139394-de4798aa62b2?w=800&q=80",
      ],
    },
    {
      name: "Bluetooth Speaker Portable",
      description: "Waterproof Bluetooth speaker. 10-hour battery. Great sound.",
      price: 34.99,
      comparePrice: 54.99,
      stock: 50,
      imageUrls: [
        "https://images.unsplash.com/photo-1608043152269-423dbba4e7e1?w=800&q=80",
        "https://images.unsplash.com/photo-1625948515291-69613efd103f?w=800&q=80",
      ],
      badge: "BEST_SELLER",
    },
    {
      name: "Headphones Wireless",
      description: "Active noise cancelling headphones. 30-hour battery. Premium sound.",
      price: 79.99,
      comparePrice: 129.99,
      stock: 40,
      imageUrls: [
        "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=800&q=80",
        "https://images.unsplash.com/photo-1625948515291-69613efd103f?w=800&q=80",
      ],
      badge: "SALE",
    },
    {
      name: "Laptop Stand Adjustable",
      description: "Ergonomic laptop stand. Adjustable height. Aluminum construction.",
      price: 24.99,
      stock: 60,
      imageUrls: [
        "https://images.unsplash.com/photo-1527864550417-7fd91fc51a46?w=800&q=80",
        "https://images.unsplash.com/photo-1625948515291-69613efd103f?w=800&q=80",
      ],
    },
    {
      name: "Keyboard Mechanical RGB",
      description: "Mechanical keyboard with RGB lighting. Cherry switches. Programmable.",
      price: 69.99,
      comparePrice: 99.99,
      stock: 35,
      imageUrls: [
        "https://images.unsplash.com/photo-1587829191301-21a97e1e2c12?w=800&q=80",
        "https://images.unsplash.com/photo-1625948515291-69613efd103f?w=800&q=80",
      ],
      badge: "SALE",
    },
    {
      name: "Mouse Wireless",
      description: "Silent click wireless mouse. Ergonomic. 18-month battery.",
      price: 18.99,
      stock: 120,
      imageUrls: [
        "https://images.unsplash.com/photo-1527814050087-3793815479db?w=800&q=80",
        "https://images.unsplash.com/photo-1625948515291-69613efd103f?w=800&q=80",
      ],
    },
    {
      name: "USB Hub 7-Port",
      description: "7-port USB 3.0 hub. High-speed data transfer. Powered.",
      price: 19.99,
      stock: 80,
      imageUrls: [
        "https://images.unsplash.com/photo-1625948515291-69613efd103f?w=800&q=80",
        "https://images.unsplash.com/photo-1569163139394-de4798aa62b2?w=800&q=80",
      ],
    },
    {
      name: "External SSD 1TB",
      description: "1TB external SSD. Ultra-fast. Portable. Durable.",
      price: 89.99,
      comparePrice: 139.99,
      stock: 30,
      imageUrls: [
        "https://images.unsplash.com/photo-1597872200969-2b65d56bd16b?w=800&q=80",
        "https://images.unsplash.com/photo-1625948515291-69613efd103f?w=800&q=80",
      ],
      badge: "BEST_SELLER",
    },
    {
      name: "Power Bank 20000mAh",
      description: "Large capacity power bank. Fast charging. Dual ports.",
      price: 24.99,
      stock: 100,
      imageUrls: [
        "https://images.unsplash.com/photo-1609091839311-d5365f9ff1c5?w=800&q=80",
        "https://images.unsplash.com/photo-1625948515291-69613efd103f?w=800&q=80",
      ],
    },
    {
      name: "Smart LED Bulbs",
      description: "Pack of 4 smart LED bulbs. Dimmable. Color changing.",
      price: 39.99,
      comparePrice: 59.99,
      stock: 50,
      imageUrls: [
        "https://images.unsplash.com/photo-1565636192335-14c0c3ecd5d8?w=800&q=80",
        "https://images.unsplash.com/photo-1625948515291-69613efd103f?w=800&q=80",
      ],
      badge: "NEW",
    },
    {
      name: "Smart Plug",
      description: "Smart plug outlet. Remote control. Timer function.",
      price: 12.99,
      stock: 150,
      imageUrls: [
        "https://images.unsplash.com/photo-1559654850-1d679f8fe0ad?w=800&q=80",
        "https://images.unsplash.com/photo-1625948515291-69613efd103f?w=800&q=80",
      ],
    },
    {
      name: "Desk Lamp LED",
      description: "USB-powered LED desk lamp. Adjustable brightness. Eye-care.",
      price: 22.99,
      stock: 70,
      imageUrls: [
        "https://images.unsplash.com/photo-1565636192335-14c0c3ecd5d8?w=800&q=80",
        "https://images.unsplash.com/photo-1625948515291-69613efd103f?w=800&q=80",
      ],
    },
    {
      name: "Cable Organizer Set",
      description: "Set of 10 cable organizers. Silicone. Great for desk organization.",
      price: 9.99,
      stock: 200,
      imageUrls: [
        "https://images.unsplash.com/photo-1625948515291-69613efd103f?w=800&q=80",
        "https://images.unsplash.com/photo-1569163139394-de4798aa62b2?w=800&q=80",
      ],
    },
  ],
};

async function main() {
  console.log("🌱 Updating 100 test products with enhanced images...");

  for (const [categorySlug, products] of Object.entries(productsByCategory)) {
    const category = await db.category.findUnique({
      where: { slug: categorySlug },
    });

    if (!category) {
      console.log(`  ⚠️  Category not found: ${categorySlug}`);
      continue;
    }

    console.log(`\n📦 ${category.name} (updating ${products.length} products):`);

    for (const product of products) {
      const slug = product.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");

      await db.product.update({
        where: { slug },
        data: {
          imageUrls: product.imageUrls,
        },
      });

      console.log(`  ✓ ${product.name} (${product.imageUrls.length} images)`);
    }
  }

  console.log("\n✅ Image update complete! All products now have enhanced images.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
