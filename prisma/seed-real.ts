import { PrismaClient } from "@prisma/client";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const db = new PrismaClient();

function slug(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const CATEGORIES = [
  {
    name: "Home and Kitchen",
    slug: "home-and-kitchen",
    imageUrl: "https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=800&q=80",
  },
  {
    name: "Cleaning Supplies",
    slug: "cleaning-supplies",
    imageUrl: "https://images.unsplash.com/photo-1583947215259-38e31be8751f?w=800&q=80",
  },
  {
    name: "Tools and Hardware",
    slug: "tools-and-hardware",
    imageUrl: "https://images.unsplash.com/photo-1581147036324-c17ac41d7de1?w=800&q=80",
  },
  {
    name: "Patio and Garden",
    slug: "patio-and-garden",
    imageUrl: "https://images.unsplash.com/photo-1416879595882-3373a0480b5b?w=800&q=80",
  },
  {
    name: "Pet Supplies",
    slug: "pet-supplies",
    imageUrl: "https://images.unsplash.com/photo-1587300003388-59208cc962cb?w=800&q=80",
  },
  {
    name: "General Merchandise",
    slug: "general-merchandise",
    imageUrl: "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=800&q=80",
  },
  {
    name: "Toys",
    slug: "toys",
    imageUrl: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800&q=80",
  },
];

type Badge = "SALE" | "BEST_SELLER" | "NEW" | null;

interface ProductDef {
  name: string;
  description: string;
  sku: string;
  price: number;
  comparePrice?: number;
  stock: number;
  badge: Badge;
  imageUrls: string[];
}

const PRODUCTS: Record<string, ProductDef[]> = {
  "home-and-kitchen": [
    { name: "Instant Pot Duo 7-in-1 Electric Pressure Cooker, 6 Qt", description: "Cook up to 70% faster with 7 kitchen appliances in one: pressure cooker, slow cooker, rice cooker, steamer, sauté pan, yogurt maker, and warmer. Features 13 customizable programs and a 6-quart stainless steel inner pot.", sku: "HAG-HK-001", price: 89.99, comparePrice: 119.99, stock: 47, badge: "SALE",
      imageUrls: ["https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=800&q=80"] },
    { name: "Cuisinart DCC-3200P1 Perfectemp 14-Cup Coffee Maker", description: "Brew up to 14 cups of coffee with a fully automatic coffeemaker featuring a 24-hour programmable timer, adjustable keep-warm temperature control, and Brew Pause feature.", sku: "HAG-HK-002", price: 79.99, stock: 62, badge: "BEST_SELLER",
      imageUrls: ["https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=800&q=80"] },
    { name: "Lodge 10.25 Inch Cast Iron Skillet", description: "Seasoned with 100% natural vegetable oil, this skillet is ready to use right out of the box. Cast iron retains heat evenly for the perfect sear on steaks, a crispy edge on cornbread, or a well-done frittata. Oven safe up to 500°F.", sku: "HAG-HK-003", price: 34.99, stock: 88, badge: "BEST_SELLER",
      imageUrls: ["https://images.unsplash.com/photo-1598970434795-0c54fe7c0648?w=800&q=80"] },
    { name: "KitchenAid KSM150PSER Artisan 5-Qt Stand Mixer", description: "With 10 speeds, the KitchenAid Artisan Stand Mixer will quickly become your kitchen's culinary center. Large enough to mix dough for 9 dozen cookies, 4 loaves of bread, or 7 pounds of mashed potatoes.", sku: "HAG-HK-004", price: 349.99, comparePrice: 449.99, stock: 18, badge: "SALE",
      imageUrls: ["https://images.unsplash.com/photo-1578985545062-69928b1d9587?w=800&q=80"] },
    { name: "Nespresso Vertuo Next Coffee and Espresso Machine", description: "Brew five cup sizes from espresso to 18oz Alto with Centrifusion technology. Wi-Fi and Bluetooth connected for software updates and personalization.", sku: "HAG-HK-005", price: 149.99, stock: 31, badge: "NEW",
      imageUrls: ["https://images.unsplash.com/photo-1541167760496-1628856ab772?w=800&q=80"] },
    { name: "Vitamix E310 Explorian Blender", description: "With 10 variable speeds and a pulse feature, the E310 gives you precise blending control. The 48-oz container is ideal for blending medium batches for individuals or small families.", sku: "HAG-HK-006", price: 299.99, stock: 22, badge: null,
      imageUrls: ["https://images.unsplash.com/photo-1570197788417-0e82375c9371?w=800&q=80"] },
    { name: "Calphalon Classic 10-Piece Pots and Pans Set", description: "Hard-anodized aluminum cookware includes 1.5-qt and 2.5-qt saucepans, 3-qt sauté pan, 5-qt Dutch oven, and 8-inch and 10-inch fry pans — all with lids.", sku: "HAG-HK-007", price: 129.99, comparePrice: 199.99, stock: 25, badge: "SALE",
      imageUrls: ["https://images.unsplash.com/photo-1588854337236-6889d631faa8?w=800&q=80"] },
    { name: "OXO Good Grips 3-Piece Stainless Steel Mixing Bowl Set", description: "Nesting stainless steel bowls with nonslip bases. Angled sides make whisking easier and measurement markings let you measure right in the bowl. Dishwasher safe.", sku: "HAG-HK-008", price: 29.99, stock: 75, badge: null,
      imageUrls: ["https://images.unsplash.com/photo-1556910103-1c02745aae4d?w=800&q=80"] },
    { name: "Rubbermaid Brilliance Food Storage Container Set, 22-Piece", description: "Leak-proof, airtight lids with secure latches keep food fresh. Crystal-clear Tritan plastic is stain and odor resistant. 100% BPA-free, microwave, dishwasher, and freezer safe.", sku: "HAG-HK-009", price: 39.99, stock: 54, badge: null,
      imageUrls: ["https://images.unsplash.com/photo-1584568694244-14fbdf83bd30?w=800&q=80"] },
    { name: "All-Clad D3 Stainless 12-Inch Fry Pan", description: "Three-ply bonded construction with aluminum core for fast and even heat distribution. Compatible with all cooktops including induction and oven safe up to 600°F. Made in the USA.", sku: "HAG-HK-010", price: 89.99, stock: 33, badge: null,
      imageUrls: ["https://images.unsplash.com/photo-1604908177453-7462950a6a3b?w=800&q=80"] },
    { name: "Pyrex 3-Piece Glass Mixing Bowl Set", description: "Timeless durable glass for mixing, serving, and storing. 1-qt, 1.5-qt, and 2.5-qt bowls safe for microwave, dishwasher, freezer, and preheated oven.", sku: "HAG-HK-011", price: 19.99, stock: 95, badge: null,
      imageUrls: ["https://images.unsplash.com/photo-1556909211-36987daf7b4d?w=800&q=80"] },
    { name: "Cuisinart TOA-60 Convection Toaster Oven Airfryer", description: "Air fry, convection bake, broil, warm, and toast in one appliance. 0.6 cubic foot capacity holds a 12-inch pizza or six slices of toast. Includes oven rack, baking pan, and air fryer basket.", sku: "HAG-HK-012", price: 199.99, comparePrice: 249.99, stock: 19, badge: "SALE",
      imageUrls: ["https://images.unsplash.com/photo-1585771724684-38269d6639fd?w=800&q=80"] },
  ],

  "cleaning-supplies": [
    { name: "Dyson V15 Detect Cordless Vacuum Cleaner", description: "The laser reveals microscopic dust with an on-screen LCD displaying what's been captured. 230 AW suction with HEPA filtration captures 99.97% of particles as small as 0.3 microns.", sku: "HAG-CS-001", price: 649.99, comparePrice: 749.99, stock: 12, badge: null,
      imageUrls: ["https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800&q=80"] },
    { name: "Bissell CrossWave All-in-One Wet-Dry Vacuum", description: "Vacuums and washes floors at the same time, cutting floor cleaning time in half. Works on sealed hard floors and area rugs. The self-cleaning cycle cleans the brush roll and tray.", sku: "HAG-CS-002", price: 249.99, stock: 28, badge: "BEST_SELLER",
      imageUrls: ["https://images.unsplash.com/photo-1527515637462-cff94edd56fe?w=800&q=80"] },
    { name: "Mr. Clean Magic Eraser Extra Durable, 8-Pack", description: "4x stronger than the leading all-purpose spray cleaner. Removes soap scum from bathtubs, grout, sinks, stoves, and more without harsh chemicals.", sku: "HAG-CS-003", price: 9.99, stock: 142, badge: null,
      imageUrls: ["https://images.unsplash.com/photo-1563453392212-326f5e854473?w=800&q=80"] },
    { name: "Swiffer WetJet Wood Floor Spray Mop Starter Kit", description: "Cleans and conditions wood floors with a specially formulated cleaning solution. Dual-nozzle sprayer covers more area and absorbent pads lock away dirt. Includes 10 mopping pads and cleaner.", sku: "HAG-CS-004", price: 39.99, stock: 55, badge: null,
      imageUrls: ["https://images.unsplash.com/photo-1583947215259-38e31be8751f?w=800&q=80"] },
    { name: "Tide Pods 3-in-1 Laundry Detergent Pacs, 81-Count", description: "3-chamber design combines detergent, stain remover, and brightener. Just toss in the drum before clothes — no measuring required. Trusted by millions for over 30 years.", sku: "HAG-CS-005", price: 24.99, stock: 87, badge: "BEST_SELLER",
      imageUrls: ["https://images.unsplash.com/photo-1582735689369-4fe89db7114c?w=800&q=80"] },
    { name: "Seventh Generation Multi-Surface Cleaner, 32 oz", description: "Plant-based cleaning power cuts through grease without harsh chemicals. Free of synthetic fragrances and dyes. USDA Certified Biobased, EPA Safer Choice certified.", sku: "HAG-CS-006", price: 5.99, stock: 110, badge: "NEW",
      imageUrls: ["https://images.unsplash.com/photo-1585771724684-38269d6639fd?w=800&q=80"] },
    { name: "Clorox Disinfecting Wipes, 75-Count, 3-Pack", description: "Kills 99.9% of viruses and bacteria. Pre-moistened wipes are safe on wood, sealed granite, stainless steel, and plastic surfaces.", sku: "HAG-CS-007", price: 14.99, stock: 130, badge: null,
      imageUrls: ["https://images.unsplash.com/photo-1604335399105-a0c585fd81a1?w=800&q=80"] },
    { name: "Dawn Ultra Dishwashing Liquid, Original Scent, 90 oz", description: "3x more grease-cleaning power per drop than the non-ultra version. Tough on grease yet gentle on hands for dishes that come out squeaky clean.", sku: "HAG-CS-008", price: 11.99, stock: 98, badge: null,
      imageUrls: ["https://images.unsplash.com/photo-1556909172-54557c7e4fb7?w=800&q=80"] },
    { name: "OXO Good Grips Soap-Dispensing Dish Brush", description: "Easy pump dispenses just the right amount of soap onto the brush head. Large comfortable handle with soft, non-slip grip for control while washing.", sku: "HAG-CS-009", price: 12.99, stock: 77, badge: null,
      imageUrls: ["https://images.unsplash.com/photo-1527515637462-cff94edd56fe?w=800&q=80"] },
    { name: "Arm & Hammer Pure Baking Soda, 5 lb", description: "America's #1 trusted baking soda. Use for baking, deodorizing the refrigerator, freshening laundry, and hundreds of household cleaning tasks. Pure USP-grade sodium bicarbonate.", sku: "HAG-CS-010", price: 7.99, stock: 115, badge: null,
      imageUrls: ["https://images.unsplash.com/photo-1563453392212-326f5e854473?w=800&q=80"] },
  ],

  "tools-and-hardware": [
    { name: "DEWALT 20V MAX Cordless Drill/Driver Combo Kit, 2-Tool", description: "Includes 20V MAX compact 1/2-in drill/driver and 20V MAX impact driver. 2-speed transmission (0-450/1,500 rpm) delivers 300 UWO of power. Includes 2 lithium ion batteries and charger.", sku: "HAG-TH-001", price: 179.99, comparePrice: 229.99, stock: 23, badge: "SALE",
      imageUrls: ["https://images.unsplash.com/photo-1504148455328-c376907d081c?w=800&q=80"] },
    { name: "Stanley 65-Piece Homeowner's Tool Kit", description: "Complete toolkit with hammers, pliers, screwdrivers, wrenches, measuring tape, and more. Stored in a durable blow-molded case for easy transport and organization.", sku: "HAG-TH-002", price: 49.99, stock: 41, badge: "BEST_SELLER",
      imageUrls: ["https://images.unsplash.com/photo-1581147036324-c17ac41d7de1?w=800&q=80"] },
    { name: "Milwaukee M18 FUEL 7-1/4 Inch Circular Saw", description: "Delivers 5,000 RPM with POWERSTATE Brushless Motor and REDLINK PLUS Intelligence. The most powerful cordless circular saw in its class. Compatible with all M18 batteries.", sku: "HAG-TH-003", price: 249.99, stock: 15, badge: "NEW",
      imageUrls: ["https://images.unsplash.com/photo-1572981779307-38b8cabb2407?w=800&q=80"] },
    { name: "CRAFTSMAN Tape Measure, Self-Lock, 25-Feet", description: "1-1/4-inch wide blade with self-locking thumb latch and true-zero end hook. 11-foot stand-out for one-person measuring. Printed in both inches and metric.", sku: "HAG-TH-004", price: 14.99, stock: 120, badge: null,
      imageUrls: ["https://images.unsplash.com/photo-1530124566582-a618bc2615dc?w=800&q=80"] },
    { name: "Werner 6-Foot Aluminum Step Ladder, 300-lb Capacity", description: "Type I-A ladder with slip-resistant feet, a tool tray, and pail shelf. Lightweight yet strong aluminum construction. Meets ANSI and OSHA standards.", sku: "HAG-TH-005", price: 59.99, stock: 34, badge: null,
      imageUrls: ["https://images.unsplash.com/photo-1504148455328-c376907d081c?w=800&q=80"] },
    { name: "Black+Decker BDEMS600 Mouse Detail Sander", description: "Compact design reaches into corners and tight spaces. Oscillating head with 1.2 Amp motor for precision sanding. Accepts standard sandpaper for easy replacement.", sku: "HAG-TH-006", price: 29.99, stock: 48, badge: null,
      imageUrls: ["https://images.unsplash.com/photo-1572981779307-38b8cabb2407?w=800&q=80"] },
    { name: "Channellock 8-Piece Pliers Set", description: "Professional-grade set with lineman's, needle nose, diagonal, slip-joint, and tongue-and-groove pliers. CrossForce technology for added grip. Made in the USA with high-carbon steel.", sku: "HAG-TH-007", price: 89.99, stock: 27, badge: null,
      imageUrls: ["https://images.unsplash.com/photo-1581147036324-c17ac41d7de1?w=800&q=80"] },
    { name: "Irwin Tools 6-Piece Bi-Material Screwdriver Set", description: "ProTouch bi-material handle for comfort and high torque. Precision-machined tips reduce cam-out. Includes Phillips #1, #2, #3 and slotted 1/4-in, 5/16-in, 3/8-in.", sku: "HAG-TH-008", price: 19.99, stock: 85, badge: null,
      imageUrls: ["https://images.unsplash.com/photo-1530124566582-a618bc2615dc?w=800&q=80"] },
    { name: "DEWALT 20V MAX LED Work Light, Tripod", description: "3,000 lumens output across 110° beam angle. Adjustable tripod stands 13-in to 55-in high. Compatible with all DEWALT 20V MAX batteries with 3 light modes.", sku: "HAG-TH-009", price: 59.99, stock: 36, badge: "BEST_SELLER",
      imageUrls: ["https://images.unsplash.com/photo-1504148455328-c376907d081c?w=800&q=80"] },
    { name: "Klein Tools 11-in-1 Screwdriver and Nut Driver Set", description: "Converts from screwdriver to nut driver with a quick-release shaft. Includes 6 screwdriver bits and 5 nut driver sizes. Cushion-grip handle for comfort.", sku: "HAG-TH-010", price: 24.99, stock: 67, badge: null,
      imageUrls: ["https://images.unsplash.com/photo-1581147036324-c17ac41d7de1?w=800&q=80"] },
    { name: "Bosch 12V Max Cordless Multi-Tool Kit", description: "Slim profile for confined spaces with 1.6° oscillation angle for aggressive cutting in wood, plaster, and grout. Includes 10 accessories and a soft carry case.", sku: "HAG-TH-011", price: 129.99, stock: 19, badge: null,
      imageUrls: ["https://images.unsplash.com/photo-1572981779307-38b8cabb2407?w=800&q=80"] },
    { name: "Ryobi 18V ONE+ Reciprocating Saw (Tool Only)", description: "7/8-inch stroke length for fast cutting through wood, metal, and other materials. Tool-free blade changes make switching blades quick and easy.", sku: "HAG-TH-012", price: 79.99, stock: 28, badge: null,
      imageUrls: ["https://images.unsplash.com/photo-1530124566582-a618bc2615dc?w=800&q=80"] },
  ],

  "patio-and-garden": [
    { name: "Weber Spirit II E-310 3-Burner Liquid Propane Gas Grill", description: "Three burners delivering 30,000 BTUs and 529 sq-in cooking area. GS4 grilling system with Flavorizer bars and infinity ignition for a consistent spark every time.", sku: "HAG-PG-001", price: 499.99, comparePrice: 599.99, stock: 8, badge: "SALE",
      imageUrls: ["https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=800&q=80"] },
    { name: "Fiskars 46-Inch Long-Handle Digging Spade", description: "Welded steel blade that won't bend or break. The 46-inch handle reduces back strain with a D-handle design for extra control and leverage. Lifetime warranty.", sku: "HAG-PG-002", price: 39.99, stock: 52, badge: null,
      imageUrls: ["https://images.unsplash.com/photo-1416879595882-3373a0480b5b?w=800&q=80"] },
    { name: "Miracle-Gro All Purpose Potting Soil Mix, 2 Cu Ft", description: "Feeds plants for up to 6 months. Grows plants twice as large versus unfed plants. Safe for all plants, ideal for containers, gardens, and raised beds.", sku: "HAG-PG-003", price: 14.99, stock: 88, badge: "BEST_SELLER",
      imageUrls: ["https://images.unsplash.com/photo-1585320806297-9794b3e4eeae?w=800&q=80"] },
    { name: "Suncast 50-Gallon Patio Storage Deck Box", description: "Sturdy resin resists denting, rusting, and UV rays. Spacious 50-gallon interior for seat cushions, pool toys, gardening tools, and other outdoor essentials.", sku: "HAG-PG-004", price: 89.99, stock: 29, badge: null,
      imageUrls: ["https://images.unsplash.com/photo-1506439773649-6e0eb8cfb237?w=800&q=80"] },
    { name: "Hampton Bay 7-Piece Wicker Patio Dining Set", description: "All-weather wicker with powder-coated aluminum frames. 60-in round table and six cushioned chairs with fade-resistant Sunbrella cushions. Seats 6 comfortably.", sku: "HAG-PG-005", price: 649.99, stock: 6, badge: "NEW",
      imageUrls: ["https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=800&q=80"] },
    { name: "Orbit 62100 Yard Enforcer Motion-Activated Sprinkler", description: "Detects heat and movement up to 40 feet away, releasing a startling burst of water. Day and night detection with adjustable sensitivity to protect gardens from animals.", sku: "HAG-PG-006", price: 69.99, stock: 38, badge: null,
      imageUrls: ["https://images.unsplash.com/photo-1585320806297-9794b3e4eeae?w=800&q=80"] },
    { name: "Scotts Turf Builder Lawn Food, 15,000 Sq Ft", description: "Builds thick, green lawns by feeding and strengthening grass. Works on any grass type even in hot weather. Safe for people and pets when used as directed.", sku: "HAG-PG-007", price: 29.99, stock: 61, badge: null,
      imageUrls: ["https://images.unsplash.com/photo-1416879595882-3373a0480b5b?w=800&q=80"] },
    { name: "Coleman Sundome 6-Person Camping Tent", description: "Sets up in about 10 minutes with WeatherTec system featuring welded floors and inverted seams. Two large windows and a ground vent provide ventilation.", sku: "HAG-PG-008", price: 149.99, comparePrice: 199.99, stock: 17, badge: "SALE",
      imageUrls: ["https://images.unsplash.com/photo-1506439773649-6e0eb8cfb237?w=800&q=80"] },
    { name: "Rain Bird 6-Zone Indoor/Outdoor Irrigation Timer", description: "Programs up to 6 zones with 4 independent programs and 3 start times each. Easy-to-read display with weather-resistant housing and solar sync compatibility.", sku: "HAG-PG-009", price: 34.99, stock: 44, badge: null,
      imageUrls: ["https://images.unsplash.com/photo-1585320806297-9794b3e4eeae?w=800&q=80"] },
    { name: "Keter Adirondack Outdoor Resin Chair, 2-Pack", description: "Classic Adirondack styling with modern low-maintenance resin. Weather-resistant and UV-protected — no painting or staining required. Ergonomic design with wide armrests. Stackable.", sku: "HAG-PG-010", price: 129.99, stock: 31, badge: null,
      imageUrls: ["https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=800&q=80"] },
  ],

  "pet-supplies": [
    { name: "Purina Pro Plan High Protein Dry Dog Food, 30 lb", description: "Real chicken is the #1 ingredient. Fortified with guaranteed live probiotics to support digestive and immune health. No artificial colors or flavors.", sku: "HAG-PS-001", price: 64.99, stock: 39, badge: "BEST_SELLER",
      imageUrls: ["https://images.unsplash.com/photo-1587300003388-59208cc962cb?w=800&q=80"] },
    { name: "PetSafe Smart Feed Automatic Dog and Cat Feeder", description: "Dispenses up to 12 meals per day with portions from 1/8 cup to 4 cups. App-enabled for iPhone and Android. Slow feed option promotes healthy eating.", sku: "HAG-PS-002", price: 149.99, comparePrice: 179.99, stock: 21, badge: null,
      imageUrls: ["https://images.unsplash.com/photo-1548767797-d8c844163c4a?w=800&q=80"] },
    { name: "KONG Classic Dog Toy, Large", description: "The gold standard of dog toys. Ultra-durable all-natural rubber for aggressive chewers. Stuff with KONG Easy Treat or peanut butter to make playtime last longer.", sku: "HAG-PS-003", price: 14.99, stock: 95, badge: null,
      imageUrls: ["https://images.unsplash.com/photo-1587300003388-59208cc962cb?w=800&q=80"] },
    { name: "Catit Flower Fountain, 3-Liter", description: "Triple-action filter removes chlorine, bad tastes, hair, and debris. Three water flow settings encourage cats to drink more. 3-liter capacity requires fewer refills.", sku: "HAG-PS-004", price: 34.99, stock: 47, badge: "NEW",
      imageUrls: ["https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?w=800&q=80"] },
    { name: "Frisco Fold & Carry Single Door Dog Crate, 36 Inch", description: "Removable plastic leak-proof pan for easy cleaning. Double-door design with multiple entry points. Folds flat for storage. Divider panel grows with your puppy.", sku: "HAG-PS-005", price: 59.99, stock: 33, badge: "BEST_SELLER",
      imageUrls: ["https://images.unsplash.com/photo-1587300003388-59208cc962cb?w=800&q=80"] },
    { name: "Blue Buffalo Life Protection Adult Cat Food, 15 lb", description: "Real chicken as the first ingredient with BLUE's exclusive LifeSource Bits — a blend of antioxidants, vitamins, and minerals. No by-product meals, corn, wheat, soy, or artificial flavors.", sku: "HAG-PS-006", price: 44.99, stock: 52, badge: null,
      imageUrls: ["https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?w=800&q=80"] },
    { name: "PetSafe Easy Walk No-Pull Dog Harness, Medium", description: "Front chest leash attachment steers your dog to the side when he pulls. Martingale loop tightens slightly when pulling, discouraging behavior without choking.", sku: "HAG-PS-007", price: 24.99, stock: 68, badge: null,
      imageUrls: ["https://images.unsplash.com/photo-1548767797-d8c844163c4a?w=800&q=80"] },
    { name: "Furhaven Ultra Plush Orthopedic Dog Bed, XL", description: "Medical-grade orthopedic foam base cradles pressure points and conforms to your pet's body. Ultra-plush faux fur top for burrowing. Removable, machine-washable cover.", sku: "HAG-PS-008", price: 79.99, comparePrice: 109.99, stock: 24, badge: "SALE",
      imageUrls: ["https://images.unsplash.com/photo-1587300003388-59208cc962cb?w=800&q=80"] },
    { name: "Nylabone Power Chew Textured Dog Chew Toy, Large", description: "For aggressive chewers. Flavored nylon satisfies the instinct to chew while cleaning teeth and controlling plaque. Made in the USA. For dogs up to 50 lbs.", sku: "HAG-PS-009", price: 12.99, stock: 82, badge: null,
      imageUrls: ["https://images.unsplash.com/photo-1548767797-d8c844163c4a?w=800&q=80"] },
    { name: "Arm & Hammer Clump & Seal Platinum Cat Litter, 40 lb", description: "Seals and destroys odors on contact with a 7-day odor-free home guarantee. Clumps tightly for easy scooping. 10% more moisture-activated deodorizers. Dust-free formula.", sku: "HAG-PS-010", price: 19.99, stock: 73, badge: null,
      imageUrls: ["https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?w=800&q=80"] },
  ],

  "general-merchandise": [
    { name: "YETI Rambler 30 oz Travel Mug with MagSlider Lid", description: "Double-wall vacuum insulation keeps beverages hot or iced for hours. MagSlider lid uses magnets to keep your drink covered while making it easy to sip.", sku: "HAG-GM-001", price: 35.00, stock: 58, badge: "BEST_SELLER",
      imageUrls: ["https://images.unsplash.com/photo-1602143407151-7111542de6e8?w=800&q=80"] },
    { name: "Hydro Flask 32 oz Wide Mouth Water Bottle", description: "TempShield double-wall vacuum insulation keeps cold up to 24 hours, hot up to 12 hours. Pro-grade 18/8 stainless steel with lifetime warranty. BPA-free. Fits most cup holders.", sku: "HAG-GM-002", price: 44.95, stock: 44, badge: null,
      imageUrls: ["https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=800&q=80"] },
    { name: "Samsonite Omni PC Hardside Expandable Luggage, 20-Inch", description: "Micro-diamond texture exterior for scratch resistance. TSA-approved combination lock, spinner wheels for 360-degree mobility, and expandable design for extra packing capacity.", sku: "HAG-GM-003", price: 149.99, comparePrice: 219.99, stock: 18, badge: "SALE",
      imageUrls: ["https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=800&q=80"] },
    { name: "Moleskine Classic Notebook, Large, Hard Cover, Ruled", description: "Legendary notebook with acid-free paper, rounded corners, elastic closure, and expandable inner pocket. 240 ivory-colored pages with ribbon bookmark. 5 x 8.25 inches.", sku: "HAG-GM-004", price: 22.95, stock: 86, badge: null,
      imageUrls: ["https://images.unsplash.com/photo-1531346878377-a5be20888e57?w=800&q=80"] },
    { name: "Sharpie S-Gel Pens, Fine Point, 12-Pack, Assorted Colors", description: "Gel ink delivers smooth, skip-free writing with vibrant color. Ergonomic soft-grip barrel reduces fatigue. Waterproof and smear-resistant for crisp lines.", sku: "HAG-GM-005", price: 12.99, stock: 113, badge: "BEST_SELLER",
      imageUrls: ["https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=800&q=80"] },
    { name: "Post-it Super Sticky Notes, 3x3 Inch, 12-Pack, 90 Sheets", description: "Super Sticky adhesive sticks and re-sticks on low-adhesion surfaces including painted walls, windows, and doors. 2x the sticking power of original Post-it Notes.", sku: "HAG-GM-006", price: 19.99, stock: 97, badge: null,
      imageUrls: ["https://images.unsplash.com/photo-1531346878377-a5be20888e57?w=800&q=80"] },
    { name: "Brita Standard Water Filter Pitcher, 10-Cup", description: "Reduces chlorine taste and odor, zinc, and particulates. BPA-free pitcher with easy-fill lid and SmartLight filter indicator. Each filter lasts 2 months. 10-cup capacity.", sku: "HAG-GM-007", price: 29.99, stock: 66, badge: "NEW",
      imageUrls: ["https://images.unsplash.com/photo-1602143407151-7111542de6e8?w=800&q=80"] },
    { name: "AmazonBasics AAA Performance Alkaline Batteries, 36-Pack", description: "Reliable, long-lasting power for everyday devices. Holds power for up to 10 years in storage. Compatible with remote controls, toys, flashlights, and wireless devices.", sku: "HAG-GM-008", price: 14.99, stock: 145, badge: null,
      imageUrls: ["https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=800&q=80"] },
    { name: "Scotch Heavy Duty Shipping Packaging Tape, 6-Pack", description: "Heavy-duty tape for securing and sealing boxes. Aggressive adhesive sticks instantly to varied surfaces. Each roll: 1.88 inches x 54.6 yards. Crystal-clear finish.", sku: "HAG-GM-009", price: 14.99, stock: 102, badge: null,
      imageUrls: ["https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=800&q=80"] },
    { name: "TUMI Alpha Bravo Backpack", description: "Dedicated laptop compartment fits up to 15-inch laptops. Front organizational pocket and luggage pass-through sleeve. Made from ballistic nylon for exceptional durability.", sku: "HAG-GM-010", price: 295.00, comparePrice: 395.00, stock: 11, badge: "SALE",
      imageUrls: ["https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=800&q=80"] },
  ],

  "toys": [
    { name: "LEGO City Police Chase Building Set, 60314", description: "Police helicopter, getaway truck, and ice cream cart with 3 minifigures: police pilot, officer, and crook. 317 pieces. Recommended for ages 6 and up.", sku: "HAG-TY-001", price: 39.99, stock: 43, badge: "BEST_SELLER",
      imageUrls: ["https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800&q=80"] },
    { name: "Hasbro Monopoly Classic Board Game", description: "The classic fast-dealing property trading game for 2-6 players. Buy, sell, and trade properties, build houses and hotels, and bankrupt your opponents. For ages 8 and up.", sku: "HAG-TY-002", price: 19.99, stock: 76, badge: null,
      imageUrls: ["https://images.unsplash.com/photo-1566576912321-d58ddd7a6088?w=800&q=80"] },
    { name: "Melissa & Doug 60-Piece Wooden Building Blocks Set", description: "Classic hardwood blocks in 9 shapes and 4 natural colors. Develops fine motor skills, creativity, and early math concepts. Includes sturdy wooden storage crate. Ages 2+.", sku: "HAG-TY-003", price: 24.99, stock: 58, badge: "NEW",
      imageUrls: ["https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800&q=80"] },
    { name: "Nerf Elite 2.0 Echo CS-10 Blaster", description: "Fires darts up to 90 feet with a 10-dart clip and 24 Elite darts included. Clip-fed motorized blaster with tactical rails and customizable attachment points.", sku: "HAG-TY-004", price: 29.99, comparePrice: 39.99, stock: 35, badge: "SALE",
      imageUrls: ["https://images.unsplash.com/photo-1566576912321-d58ddd7a6088?w=800&q=80"] },
    { name: "Hot Wheels 20-Car Gift Pack", description: "Twenty 1:64 scale die-cast cars with authentic detailing and real rolling wheels. Great for collecting and racing. Includes a variety of styles — no two packs exactly alike. Ages 3+.", sku: "HAG-TY-005", price: 19.99, stock: 67, badge: "BEST_SELLER",
      imageUrls: ["https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800&q=80"] },
    { name: "Play-Doh Modeling Compound 10-Pack", description: "Ten 2-oz cans in red, yellow, blue, white, green, orange, black, pink, purple, and gold. Non-toxic, non-irritating, non-allergenic. For ages 2 and up.", sku: "HAG-TY-006", price: 12.99, stock: 89, badge: null,
      imageUrls: ["https://images.unsplash.com/photo-1566576912321-d58ddd7a6088?w=800&q=80"] },
    { name: "Ravensburger Krypt Silver 654-Piece Jigsaw Puzzle", description: "No color areas or patterns to guide assembly — only piece shapes. Premium Softclick technology ensures pieces fit precisely. For ages 14 and up.", sku: "HAG-TY-007", price: 17.99, stock: 41, badge: null,
      imageUrls: ["https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800&q=80"] },
    { name: "Barbie Dreamhouse Adventures Chelsea Doll, Assorted", description: "6-inch Chelsea doll dressed and ready for adventure with cute and colorful fashion. Great gift for kids ages 3 and up. Accessories and playsets sold separately.", sku: "HAG-TY-008", price: 44.99, comparePrice: 59.99, stock: 28, badge: null,
      imageUrls: ["https://images.unsplash.com/photo-1566576912321-d58ddd7a6088?w=800&q=80"] },
    { name: "Jenga Classic Block Stacking Tower Game", description: "Pull out a block without knocking the tower down, then stack it on top. Includes 54 hardwood blocks and stacking sleeve. For ages 6 and up, 1+ players.", sku: "HAG-TY-009", price: 12.99, stock: 79, badge: null,
      imageUrls: ["https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800&q=80"] },
    { name: "Fisher-Price Little People Animal Friends Farm Playset", description: "Interactive playset with barn, tractor, animals, and farmer figures. Lights, sounds, and music bring the farm to life. Drop animals through the roof for fun responses. Ages 1-5.", sku: "HAG-TY-010", price: 34.99, stock: 46, badge: null,
      imageUrls: ["https://images.unsplash.com/photo-1566576912321-d58ddd7a6088?w=800&q=80"] },
  ],
};

async function main() {
  console.log("🌱 Starting real product seed...\n");

  // Step 1: Upsert categories
  console.log("📂 Upserting categories...");
  const categoryMap: Record<string, string> = {};
  for (const cat of CATEGORIES) {
    const record = await db.category.upsert({
      where: { slug: cat.slug },
      update: { imageUrl: cat.imageUrl },
      create: { name: cat.name, slug: cat.slug, imageUrl: cat.imageUrl },
    });
    categoryMap[cat.slug] = record.id;
    console.log(`  ✓ ${cat.name}`);
  }

  // Step 2: Delete existing products and media
  console.log("\n🗑️  Clearing existing products...");
  await db.productMedia.deleteMany({});
  await db.cartItem.deleteMany({});
  await db.orderItem.deleteMany({});
  await db.product.deleteMany({});
  console.log("  ✓ Cleared");

  // Step 3: Insert real products
  console.log("\n📦 Inserting products...");
  let total = 0;
  for (const [categorySlug, products] of Object.entries(PRODUCTS)) {
    const categoryId = categoryMap[categorySlug];
    if (!categoryId) {
      console.warn(`  ⚠️  Category not found: ${categorySlug}`);
      continue;
    }
    for (const p of products) {
      const product = await db.product.create({
        data: {
          name: p.name,
          slug: slug(p.name),
          description: p.description,
          sku: p.sku,
          price: p.price,
          comparePrice: p.comparePrice ?? null,
          stock: p.stock,
          badge: p.badge ?? null,
          imageUrls: p.imageUrls,
          categoryId,
        },
      });

      for (let i = 0; i < p.imageUrls.length; i++) {
        await db.productMedia.create({
          data: {
            productId: product.id,
            type: "IMAGE",
            url: p.imageUrls[i],
            storagePath: p.imageUrls[i],
            order: i,
          },
        });
      }

      total++;
    }
    console.log(`  ✓ ${categorySlug} — ${products.length} products`);
  }

  console.log(`\n✅ Done! ${total} products seeded across ${CATEGORIES.length} categories.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => db.$disconnect());
